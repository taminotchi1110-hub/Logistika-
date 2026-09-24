import 'dart:convert';
import 'dart:io';
import 'dart:ui' show Rect;

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'profile_repository.dart';

/// Faylni diskka yozadi va yo'lini qaytaradi.
typedef ExportSaver = Future<String> Function(String fileName, String contents);

/// Tizimning ulashish oynasini ochadi.
///
/// `origin` — iPad uchun: u ulashish oynasini qalqib chiquvchi (popover)
/// ko'rinishida ochadi va uni QAYERDAN chiqarishni bilishi shart.
/// Bo'sh bo'lsa iPad'da ilova yiqiladi, iPhone'da esa e'tiborga olinmaydi.
typedef ExportSharer = Future<void> Function(String path, String subject, Rect? origin);

/// "Ma'lumotlarimning nusxasi": serverdan oladi, faylga yozadi va
/// tizimning ulashish oynasini ochadi.
///
/// NEGA ULASHISH OYNASI: ilova faylni hech qayerga O'ZI yubormaydi.
/// Foydalanuvchi uni qayerga saqlashni (Fayllar, pochta, Telegram) o'zi
/// tanlaydi. Bu ham sodda, ham xavfsiz: shaxsiy ma'lumot ilova tanlagan
/// kanalga emas, foydalanuvchi tanlagan kanalga ketadi.
///
/// NEGA KESHGA: fayl shaxsiy ma'lumotga to'la. Kesh ilova o'chirilganda
/// tizim tomonidan tozalanadi va boshqa ilovalar uni o'qiy olmaydi.
/// "Yuklamalar" papkasi esa butun qurilmaga ochiq bo'lardi.
class DataExportService {
  DataExportService(
    this._repository, {
    ExportSaver? saver,
    ExportSharer? sharer,
  })  : _save = saver ?? _writeToCache,
        _share = sharer ?? _openShareSheet;

  final ProfileRepository _repository;
  final ExportSaver _save;
  final ExportSharer _share;

  /// Ma'lumotni oladi, faylga yozadi, ulashish oynasini ochadi.
  /// Yaratilgan fayl yo'lini qaytaradi.
  Future<String> exportAndShare({
    required String subject,
    Rect? origin,
    DateTime? now,
  }) async {
    final data = await _repository.exportData();
    final path = await _save(fileName(now ?? DateTime.now()), encode(data));
    await _share(path, subject, origin);
    return path;
  }

  /// `karvon-malumotlarim-2026-09-23.json`
  ///
  /// Sana nomda bo'ladi: foydalanuvchi bir necha marta eksport qilsa
  /// fayllar aralashib ketmasin.
  static String fileName(DateTime now) {
    final month = now.month.toString().padLeft(2, '0');
    final day = now.day.toString().padLeft(2, '0');
    return 'karvon-malumotlarim-${now.year}-$month-$day.json';
  }

  /// Odam o'qiy oladigan JSON — eksport mashina uchun emas, odam uchun.
  static String encode(Map<String, dynamic> data) {
    return const JsonEncoder.withIndent('  ').convert(data);
  }

  static Future<String> _writeToCache(String fileName, String contents) async {
    final directory = await getTemporaryDirectory();
    final file = File('${directory.path}${Platform.pathSeparator}$fileName');
    await file.writeAsString(contents);
    return file.path;
  }

  static Future<void> _openShareSheet(String path, String subject, Rect? origin) async {
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(path)],
        subject: subject,
        sharePositionOrigin: origin,
      ),
    );
  }
}

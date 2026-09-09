import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/document.dart';

/// Hujjatlar bilan ishlash.
///
/// YUKLASH UCH QADAMDA:
///   1. `POST /media/presign` — vaqtinchalik imzolangan havola olinadi.
///   2. Fayl **to'g'ridan-to'g'ri S3 ga** PUT qilinadi. Backend orqali
///      o'tkazilsa, u har bir faylni xotiraga oladi va katta yuklamada
///      qulaydi; bundan tashqari mobil internetda ikki barobar trafik.
///   3. `POST /documents` — kalit yuboriladi va hujjat yozuvi yaratiladi.
///
/// Faqat 3-qadam bajarilgach hujjat mavjud hisoblanadi: yuklash yarim
/// yo'lda uzilsa, S3 da egasiz fayl qoladi va u keyin tozalanadi.
class DocumentsRepository {
  DocumentsRepository(this._api, {Dio? uploader})
      : _uploader = uploader ?? Dio();

  final ApiClient _api;

  /// S3 ga to'g'ridan-to'g'ri yuklash uchun ALOHIDA mijoz.
  ///
  /// `ApiClient` ga qo'shib bo'lmaydi: u har bir so'rovga `Authorization`
  /// sarlavhasini qo'shadi va uni S3 imzoga kirmagan sarlavha deb rad
  /// etadi. Bazaviy manzil ham boshqa.
  final Dio _uploader;

  Future<List<UserDocument>> mine() async {
    final data = await _api.get<List<dynamic>>('/documents');
    return data
        .map((item) => UserDocument.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Hujjat yuklaydi va yozuvini yaratadi.
  ///
  /// `ownerId` — hujjat kimga tegishli: shaxsiy hujjatlarda o'z ID'ingiz,
  /// transport hujjatlarida transport ID'si.
  Future<UserDocument> upload({
    required File file,
    required DocumentType type,
    required String ownerId,
    String? pageSide,
    DateTime? expiresAt,
  }) async {
    final bytes = await file.readAsBytes();
    final mimeType = _mimeTypeOf(file.path);

    final presigned = await _presign(mimeType: mimeType, sizeBytes: bytes.length);

    if (presigned.maxBytes > 0 && bytes.length > presigned.maxBytes) {
      throw const ApiException(
        code: 'FILE_TOO_LARGE',
        message: 'Fayl juda katta',
        statusCode: 400,
      );
    }

    await _putToStorage(presigned.uploadUrl, bytes, mimeType);

    return _create(
      fileKey: presigned.fileKey,
      type: type,
      ownerId: ownerId,
      fileName: file.uri.pathSegments.last,
      pageSide: pageSide,
      expiresAt: expiresAt,
    );
  }

  Future<void> remove(String id) async {
    await _api.delete<dynamic>('/documents/$id');
  }

  // ------------------------------------------------------------ ichki

  Future<PresignedUpload> _presign({
    required String mimeType,
    required int sizeBytes,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/media/presign',
      body: {
        'purpose': 'document',
        'mimeType': mimeType,
        'sizeBytes': sizeBytes,
      },
    );
    return PresignedUpload.fromJson(data);
  }

  /// Faylni S3 ga qo'yadi.
  ///
  /// `Content-Type` va `Content-Length` AYNAN presign so'rovidagidek
  /// bo'lishi shart — ular imzoga kiradi va farq qilsa S3 403 qaytaradi.
  Future<void> _putToStorage(String url, Uint8List bytes, String mimeType) async {
    try {
      await _uploader.put<void>(
        url,
        data: Stream.fromIterable([bytes]),
        options: Options(
          headers: {
            'Content-Type': mimeType,
            'Content-Length': bytes.length,
          },
          // S3 xatolarini o'zimiz qayta ishlaymiz
          validateStatus: (status) => status != null && status < 400,
        ),
      );
    } on DioException catch (error) {
      throw ApiException(
        code: 'UPLOAD_FAILED',
        message: 'Faylni yuklab boʻlmadi. Internetni tekshiring.',
        statusCode: error.response?.statusCode ?? 0,
      );
    }
  }

  Future<UserDocument> _create({
    required String fileKey,
    required DocumentType type,
    required String ownerId,
    String? fileName,
    String? pageSide,
    DateTime? expiresAt,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/documents',
      body: {
        'ownerType': type.ownerType,
        'ownerId': ownerId,
        'type': type.api,
        'fileKey': fileKey,
        if (fileName != null) 'fileName': fileName,
        if (pageSide != null) 'pageSide': pageSide,
        if (expiresAt != null)
          'expiresAt': expiresAt.toUtc().toIso8601String().split('T').first,
      },
    );
    return UserDocument.fromJson(data);
  }

  /// Kengaytmadan MIME turi.
  ///
  /// Server faqat shu ro'yxatni qabul qiladi; boshqasi yuborilsa
  /// so'rov presign bosqichidayoq rad etiladi.
  static String _mimeTypeOf(String path) {
    final extension = path.toLowerCase().split('.').last;
    return switch (extension) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      'heic' => 'image/heic',
      'pdf' => 'application/pdf',
      _ => 'image/jpeg',
    };
  }
}

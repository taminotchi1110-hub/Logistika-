import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/profile/data/data_export_service.dart';
import 'package:karvon/features/profile/data/profile_repository.dart';
import 'package:mocktail/mocktail.dart';

class _MockProfileRepository extends Mock implements ProfileRepository {}

/// "Ma'lumotlarimning nusxasi" — fayl nomi, formati va oqimi.
///
/// Fayl yozish va ulashish oynasi platforma plaginlari orqali ketadi,
/// shuning uchun ular testda almashtiriladi: tekshirilayotgani —
/// XIZMAT MANTIQI, plaginlar emas.
void main() {
  late _MockProfileRepository repository;

  setUp(() {
    repository = _MockProfileRepository();
  });

  group('fayl nomi', () {
    test('sana bilan, nol bilan toʻldirilgan', () {
      expect(
        DataExportService.fileName(DateTime(2026, 9, 3)),
        'karvon-malumotlarim-2026-09-03.json',
      );
      expect(
        DataExportService.fileName(DateTime(2026, 12, 31)),
        'karvon-malumotlarim-2026-12-31.json',
      );
    });
  });

  group('format', () {
    test('odam oʻqiydigan JSON — chekinish bilan', () {
      final text = DataExportService.encode({
        'profile': {'phone': '+998901234567'},
      });

      expect(text, contains('\n'));
      expect(text, contains('  "profile"'));
      expect(jsonDecode(text), {
        'profile': {'phone': '+998901234567'},
      });
    });

    test('oʻzbekcha harflar buzilmaydi', () {
      final text = DataExportService.encode({'title': 'Yuk — Toshkentdan Samarqandga'});
      expect(jsonDecode(text)['title'], 'Yuk — Toshkentdan Samarqandga');
    });
  });

  group('oqim', () {
    test('serverdan oladi, faylga yozadi, ulashish oynasini ochadi', () async {
      when(repository.exportData).thenAnswer(
        (_) async => {
          'meta': {'format': 'karvon-export-v1'},
        },
      );

      String? savedName;
      String? savedBody;
      String? sharedPath;
      String? sharedSubject;

      final service = DataExportService(
        repository,
        saver: (name, contents) async {
          savedName = name;
          savedBody = contents;
          return '/kesh/$name';
        },
        sharer: (path, subject, _) async {
          sharedPath = path;
          sharedSubject = subject;
        },
      );

      final path = await service.exportAndShare(
        subject: 'Karvon — maʼlumotlarim',
        now: DateTime(2026, 9, 23),
      );

      expect(savedName, 'karvon-malumotlarim-2026-09-23.json');
      expect(jsonDecode(savedBody!)['meta']['format'], 'karvon-export-v1');
      expect(path, '/kesh/karvon-malumotlarim-2026-09-23.json');
      expect(sharedPath, path);
      expect(sharedSubject, 'Karvon — maʼlumotlarim');
      verify(repository.exportData).called(1);
    });

    test('server xato bersa fayl yozilmaydi va oyna ochilmaydi', () async {
      when(repository.exportData).thenThrow(Exception('tarmoq'));

      var saved = false;
      var shared = false;
      final service = DataExportService(
        repository,
        saver: (_, __) async {
          saved = true;
          return '/kesh/x.json';
        },
        sharer: (_, __, ___) async => shared = true,
      );

      await expectLater(
        service.exportAndShare(subject: 'x'),
        throwsA(isA<Exception>()),
      );
      expect(saved, isFalse);
      expect(shared, isFalse);
    });
  });
}

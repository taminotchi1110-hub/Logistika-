import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/utils/phone.dart';

void main() {
  group('normalizePhone', () {
    test('turli koʻrinishlarni bir formatga keltiradi', () {
      const expected = '+998901234567';
      expect(normalizePhone('901234567'), expected);
      expect(normalizePhone('90 123 45 67'), expected);
      expect(normalizePhone('+998901234567'), expected);
      expect(normalizePhone('998901234567'), expected);
      expect(normalizePhone('+998 90 123 45 67'), expected);
    });

    test('eski 8 bilan boshlanadigan format', () {
      expect(normalizePhone('8 90 123 45 67'), '+998901234567');
    });

    test('shahar raqami rad etiladi (SMS kelmaydi)', () {
      // +998 71 — Toshkent shahar raqami, mobil emas
      expect(normalizePhone('711234567'), isNull);
      expect(normalizePhone('621234567'), isNull);
    });

    test('notoʻgʻri uzunlik rad etiladi', () {
      expect(normalizePhone('9012345'), isNull);
      expect(normalizePhone('9012345678901'), isNull);
      expect(normalizePhone(''), isNull);
    });

    test('barcha operator kodlari qabul qilinadi', () {
      for (final prefix in uzbekMobilePrefixes) {
        expect(normalizePhone('${prefix}1234567'), '+998${prefix}1234567',
            reason: '$prefix kodi ishlashi kerak');
      }
    });
  });

  group('formatPhone', () {
    test('koʻrsatish formati', () {
      expect(formatPhone('+998901234567'), '+998 90 123 45 67');
    });

    test('notoʻgʻri qiymatni oʻzgartirmaydi', () {
      expect(formatPhone('123'), '123');
    });
  });

  group('maskPhone', () {
    test('oʻrtasini yashiradi', () {
      expect(maskPhone('+998901234567'), '+998 90 *** ** 67');
    });

    test('operator kodi va oxirgi ikki raqam koʻrinadi', () {
      final masked = maskPhone('+998931112233');
      expect(masked, contains('93'));
      expect(masked, contains('33'));
      expect(masked, isNot(contains('1112')));
    });
  });

  group('formatLocalInput', () {
    test('kiritish paytida ajratadi', () {
      expect(formatLocalInput('901234567'), '90 123 45 67');
      expect(formatLocalInput('90'), '90');
      expect(formatLocalInput('9012'), '90 12');
    });

    test('9 xonadan ortigʻini kesadi', () {
      expect(formatLocalInput('9012345671234'), '90 123 45 67');
    });
  });

  group('isValidUzbekMobile', () {
    test('toʻgʻri va notoʻgʻri raqamlar', () {
      expect(isValidUzbekMobile('901234567'), isTrue);
      expect(isValidUzbekMobile('711234567'), isFalse);
    });
  });

  group('operatorName', () {
    test('operatorni aniqlaydi', () {
      expect(operatorName('901234567'), 'Beeline');
      expect(operatorName('931234567'), 'Ucell');
      expect(operatorName('971234567'), 'Mobiuz');
      expect(operatorName('991234567'), 'Uzmobile');
    });

    test('notoʻgʻri raqamda null', () {
      expect(operatorName('711234567'), isNull);
    });
  });
}

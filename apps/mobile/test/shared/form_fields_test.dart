import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/shared/widgets/form_fields.dart';

/// Kiritish formatlagichlari.
///
/// Bular kichik ko'rinadi, lekin xato bo'lsa natijasi og'ir: narx
/// maydonida bitta ortiqcha nol — bu 10 baravar noto'g'ri summa.
void main() {
  TextEditingValue value(String text) =>
      TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));

  TextEditingValue apply(TextInputFormatter formatter, String from, String to) =>
      formatter.formatEditUpdate(value(from), value(to));

  group('SoumInputFormatter', () {
    const formatter = SoumInputFormatter();

    test('uch xonalab ajratadi', () {
      expect(apply(formatter, '', '240000').text, '240 000');
      expect(apply(formatter, '', '2400000').text, '2 400 000');
      expect(apply(formatter, '', '100').text, '100');
    });

    test('raqam boʻlmagan belgilar tashlanadi', () {
      expect(apply(formatter, '', '24a0b00').text, '24 000');
    });

    test('boʻsh qiymat boʻsh qoladi', () {
      expect(apply(formatter, '240 000', '').text, '');
    });

    test('★ HADDAN TASHQARI UZUN SUMMA RAD ETILADI', () {
      // 15 xonadan ortiq summa haqiqiy emas; eski qiymat saqlanadi
      final result = apply(formatter, '999 999 999 999 999', '9999999999999999');
      expect(result.text, '999 999 999 999 999');
    });

    test('kursor oxirida turadi', () {
      final result = apply(formatter, '', '240000');
      expect(result.selection.baseOffset, result.text.length);
    });
  });

  group('IntegerInputFormatter', () {
    test('faqat raqam qoladi', () {
      const formatter = IntegerInputFormatter();
      expect(apply(formatter, '', '40a0b0').text, '4000');
    });

    test('★ YUQORI CHEGARA USHLANADI', () {
      // Ogʻirlik 60 tonnadan oshmaydi — server ham shuni rad etadi
      const formatter = IntegerInputFormatter(max: 60000);

      expect(apply(formatter, '6000', '60000').text, '60000');
      expect(apply(formatter, '60000', '600000').text, '60000');
    });

    test('chegarasiz ham ishlaydi', () {
      const formatter = IntegerInputFormatter();
      expect(apply(formatter, '', '123456').text, '123456');
    });

    test('boʻsh qiymat', () {
      const formatter = IntegerInputFormatter(max: 100);
      expect(apply(formatter, '50', '').text, '');
    });
  });

  group('UzPhoneInputFormatter', () {
    const formatter = UzPhoneInputFormatter();

    test('maska qoʻyiladi', () {
      expect(apply(formatter, '', '901234567').text, '90 123 45 67');
    });

    test('chala raqam ham formatlanadi', () {
      expect(apply(formatter, '', '9012').text, '90 12');
    });
  });
}

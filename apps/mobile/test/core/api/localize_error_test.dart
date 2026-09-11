import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/l10n/app_localizations.dart';

/// Xato matnlari tarjimasi.
///
/// BU FAYL IZOHNI QOIDAGA AYLANTIRADI. `localizeError` ustida "yangi
/// kod qoʻshilganda bu yerga ham qoʻshiladi" degan izoh bor edi —
/// va u buzilgan edi: backend'dagi 8 ta kod mobil jadvalda yoʻq edi,
/// jumladan `INTERNAL_ERROR`. Endi backend'ga kod qoʻshilib, mobilga
/// qoʻshilmasa, CI yiqiladi.
void main() {
  const server = '__SERVER_MESSAGE__';

  ApiException error(String code, [Map<String, dynamic>? details]) =>
      ApiException(code: code, message: server, details: details);

  AppLocalizations l10n(AppLocale locale) => lookupAppLocalizations(locale.locale);

  group('backend bilan moslik', () {
    /// Backend'dagi barcha kodlar — manba faylning oʻzidan oʻqiladi.
    Set<String> backendCodes() {
      final source = File('../api/src/common/errors/error-codes.ts').readAsStringSync();
      return RegExp(r"[A-Z][A-Z_]+: '([A-Z_]+)'")
          .allMatches(source)
          .map((match) => match.group(1)!)
          .toSet();
    }

    /// Mobil ilovaga HECH QACHON kelmaydigan kodlar.
    ///
    /// Admin tokeni bilan foydalanuvchi tokeni ajratilgan — mobil ilova
    /// admin endpointlariga umuman murojaat qilmaydi. Roʻyxat ataylab
    /// qisqa va har bir band izohlangan: bu yerga kod qoʻshish
    /// "tarjima qilmadim" degan ongli qaror boʻlishi kerak.
    const mobileNeverSees = {
      'ADMIN_ACCOUNT_LOCKED', // faqat admin kirishi
      'ADMIN_PERMISSION_DENIED', // faqat admin endpointlari
    };

    test('★ BACKEND KODLARI FAYLDAN TOPILDI', () {
      // Fayl yoʻli yoki formati oʻzgarsa, qolgan testlar "hech narsa
      // tekshirmay" oʻtib ketmasligi uchun
      expect(backendCodes().length, greaterThan(50));
    });

    test('★ HAR BIR BACKEND KODI TARJIMA QILINGAN', () {
      final missing = <String>[];

      for (final code in backendCodes().difference(mobileNeverSees)) {
        // Server matni qaytsa — kod jadvalda yoʻq degani
        if (localizeErrorWith(l10n(AppLocale.uz), error(code)) == server) {
          missing.add(code);
        }
      }

      expect(
        missing,
        isEmpty,
        reason: 'Bu kodlar backend\'da bor, lekin `localizeErrorWith` da yoʻq: '
            'foydalanuvchi serverning oʻzbekcha texnik matnini koʻradi',
      );
    });

    test('★ 500 XATOSIDA SERVER MATNI KOʻRSATILMAYDI', () {
      // Avval aynan shu kod jadvalda yoʻq edi
      for (final locale in AppLocale.values) {
        final message = localizeErrorWith(l10n(locale), error('INTERNAL_ERROR'));
        expect(message, isNot(server));
        expect(message, isNot(contains('undefined')));
      }
    });
  });

  group('uch til', () {
    Map<String, dynamic> arb(String code) =>
        jsonDecode(File('lib/l10n/app_$code.arb').readAsStringSync()) as Map<String, dynamic>;

    Set<String> keys(Map<String, dynamic> file) =>
        file.keys.where((key) => !key.startsWith('@')).toSet();

    test('★ HAR BIR KALIT UCH TILDA BOR', () {
      // Tarjimasi yoʻq kalit TEMPLATE tilga (oʻzbekchaga) tushib qoladi
      // — ruscha interfeysda toʻsatdan oʻzbekcha jumla chiqadi va buni
      // kompilyator aytmaydi
      final uz = keys(arb('uz'));

      for (final code in ['ru', 'en']) {
        final other = keys(arb(code));
        expect(uz.difference(other), isEmpty, reason: '$code tilida yetishmaydi');
        expect(other.difference(uz), isEmpty, reason: '$code tilida ortiqcha kalit');
      }
    });

    test('★ TARJIMALAR NUSXA EMAS', () {
      // Tarjimon faylni koʻchirib, matnni oʻzgartirmay qoldirishi mumkin
      final uz = localizeErrorWith(l10n(AppLocale.uz), error('NETWORK_ERROR'));
      final ru = localizeErrorWith(l10n(AppLocale.ru), error('NETWORK_ERROR'));
      final en = localizeErrorWith(l10n(AppLocale.en), error('NETWORK_ERROR'));

      expect({uz, ru, en}, hasLength(3));
    });
  });

  group('dinamik matnlar', () {
    test('★ KUTISH VAQTI SON BILAN', () {
      final message = localizeErrorWith(
        l10n(AppLocale.uz),
        error('OTP_COOLDOWN', {'retryAfterSeconds': 45}),
      );
      expect(message, contains('45'));
    });

    test('kutish vaqti boʻlmasa umumiy matn', () {
      expect(
        localizeErrorWith(l10n(AppLocale.uz), error('OTP_COOLDOWN')),
        l10n(AppLocale.uz).errOtpCooldownWait,
      );
    });

    test('★ QOLGAN URINISHLAR SATR KOʻRINISHIDA KELSA HAM', () {
      // Server sonni satr qilib yuborishi mumkin — aks holda matn
      // "Qolgan urinishlar: null" boʻlardi
      final fromInt = localizeErrorWith(l10n(AppLocale.ru), error('OTP_INCORRECT', {'attemptsLeft': 2}));
      final fromString =
          localizeErrorWith(l10n(AppLocale.ru), error('OTP_INCORRECT', {'attemptsLeft': '2'}));

      expect(fromInt, contains('2'));
      expect(fromString, fromInt);
      expect(fromInt, isNot(contains('null')));
    });

    test('★ INGLIZCHA MAYDON XATOLARI KOʻRSATILMAYDI', () {
      // Backend maydon xatolarini inglizcha qaytaradi ("phone must be")
      final message = localizeErrorWith(
        l10n(AppLocale.uz),
        error('VALIDATION_FAILED', {
          'fields': ['phone must be a valid phone number'],
        }),
      );

      expect(message, l10n(AppLocale.uz).errValidationFields);
      expect(message, isNot(contains('must be')));
    });

    test('nomaʼlum kod — server matni (zaxira)', () {
      // Yangi kod hali jadvalga qoʻshilmagan boʻlsa, boʻsh ekrandan
      // server matni yaxshiroq
      expect(localizeErrorWith(l10n(AppLocale.en), error('BRAND_NEW_CODE')), server);
    });
  });
}


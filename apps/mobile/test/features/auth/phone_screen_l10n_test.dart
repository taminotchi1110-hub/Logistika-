import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/features/auth/presentation/phone_screen.dart';
import 'package:karvon/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Kirish ekrani uch tilda.
///
/// Tarjima ishlayotganini tekshirishning yagona ishonchli yoʻli —
/// ekranni haqiqatan chizib, matnni oʻqish. `.arb` faylida kalit
/// borligi u ekranga yetib borganini anglatmaydi.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Widget wrap(AppLocale locale) => ProviderScope(
        overrides: [
          localeControllerProvider.overrideWith(
            (ref) => LocaleController(LocaleStorage(), locale),
          ),
        ],
        child: MaterialApp(
          locale: locale.locale,
          supportedLocales: AppLocale.values.map((value) => value.locale),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          home: const PhoneScreen(),
        ),
      );

  testWidgets('★ OʻZBEKCHA MATN KOʻRINADI', (tester) async {
    await tester.pumpWidget(wrap(AppLocale.uz));
    await tester.pump();

    expect(find.text('Telefon raqamingiz'), findsOneWidget);
    expect(find.text('Davom etish'), findsOneWidget);
  });

  testWidgets('★ RUSCHA MATN KOʻRINADI', (tester) async {
    await tester.pumpWidget(wrap(AppLocale.ru));
    await tester.pump();

    expect(find.text('Ваш номер телефона'), findsOneWidget);
    expect(find.text('Продолжить'), findsOneWidget);
    // Oʻzbekcha matn QOLMASLIGI kerak: yarim tarjima qilingan ekran
    // toʻliq tarjima qilinmaganidan yomonroq koʻrinadi
    expect(find.text('Telefon raqamingiz'), findsNothing);
  });

  testWidgets('★ INGLIZCHA MATN KOʻRINADI', (tester) async {
    await tester.pumpWidget(wrap(AppLocale.en));
    await tester.pump();

    expect(find.text('Your phone number'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);
  });

  testWidgets('★ ILOVA NOMI TARJIMA QILINMAYDI', (tester) async {
    for (final locale in AppLocale.values) {
      await tester.pumpWidget(wrap(locale));
      await tester.pump();

      // Brend har uch tilda bir xil
      expect(find.text('KARVON'), findsOneWidget);
    }
  });

  testWidgets('★ TIL TANLAGICH KIRISHDAN OLDIN KOʻRINADI', (tester) async {
    await tester.pumpWidget(wrap(AppLocale.uz));
    await tester.pump();

    // Rus tilida oʻqiydigan odam oʻzbekcha interfeysni koʻrib, tilni
    // qayerdan almashtirishni bilmasa, ilovani yopadi
    expect(find.text('Oʻzbekcha'), findsOneWidget);
    expect(find.byIcon(Icons.language_rounded), findsOneWidget);
  });

  testWidgets('★ TIL ALMASHTIRILGANDA MATN OʻZGARADI', (tester) async {
    await tester.pumpWidget(wrap(AppLocale.uz));
    await tester.pump();

    await tester.tap(find.byIcon(Icons.language_rounded));
    await tester.pumpAndSettle();

    expect(find.text('Tilni tanlang'), findsOneWidget);
    await tester.tap(find.text('Русский'));
    await tester.pumpAndSettle();

    // `MaterialApp` ning `locale` i testda qotirilgan, shuning uchun
    // matn oʻzgarmaydi — lekin TANLOV saqlanishi kerak
    expect(await LocaleStorage().read(), AppLocale.ru);
  });

  _runTermsTests();
}

/// Shartlar jumlasidagi havolalar.
///
/// Bu mantiq alohida sinaladi, chunki u SOʻZ TARTIBIGA bogʻliq:
/// oʻzbekchada havolalar jumla oʻrtasida, inglizchada oxirida turadi.
void _runTermsTests() {
  group('termsSpan', () {
    List<String> parts(TextSpan span) =>
        (span.children ?? []).cast<TextSpan>().map((child) => child.text ?? '').toList();

    List<String> linkParts(TextSpan span) => (span.children ?? [])
        .cast<TextSpan>()
        .where((child) => child.style != null)
        .map((child) => child.text ?? '')
        .toList();

    test('★ OʻZBEKCHA: HAVOLALAR JUMLA OʻRTASIDA', () {
      final span = termsSpan(
        sentence: 'Davom etish orqali siz foydalanish shartlari va maxfiylik siyosatiga rozilik bildirasiz',
        links: ['foydalanish shartlari', 'maxfiylik siyosati'],
      );

      expect(linkParts(span), ['foydalanish shartlari', 'maxfiylik siyosati']);
      // Jumla toʻliq tiklanadi — birorta belgi yoʻqolmaydi
      expect(parts(span).join(), contains('ga rozilik bildirasiz'));
    });

    test('★ INGLIZCHA: BOSHQA SOʻZ TARTIBI HAM ISHLAYDI', () {
      // Boʻlaklarni qoʻshib yozish (`'siz ' + link + ' va '`) faqat
      // bitta tilda toʻgʻri chiqardi — shuning uchun jumla butunligicha
      // tarjima qilinadi
      final span = termsSpan(
        sentence: 'By continuing you agree to the terms of use and privacy policy',
        links: ['terms of use', 'privacy policy'],
      );

      expect(linkParts(span), ['terms of use', 'privacy policy']);
      expect(parts(span).first, 'By continuing you agree to the ');
    });

    test('★ TESKARI TARTIBDA BERILGAN HAVOLALAR', () {
      // Roʻyxatdagi tartib emas, JUMLADAGI tartib muhim
      final span = termsSpan(
        sentence: 'maxfiylik siyosati va foydalanish shartlari',
        links: ['foydalanish shartlari', 'maxfiylik siyosati'],
      );

      expect(linkParts(span), ['maxfiylik siyosati', 'foydalanish shartlari']);
    });

    test('★ HAVOLA TOPILMASA JUMLA YOʻQOLMAYDI', () {
      // Tarjimon havola matnini boshqacha yozib yuborsa, jumla
      // baribir koʻrinishi kerak — havolasiz boʻlsa ham
      final span = termsSpan(
        sentence: 'Shartlarga rozilik bildirasiz',
        links: ['boshqa matn'],
      );

      expect(parts(span).join(), 'Shartlarga rozilik bildirasiz');
      expect(linkParts(span), isEmpty);
    });

    test('boʻsh havola cheksiz siklga olib kelmaydi', () {
      final span = termsSpan(sentence: 'Matn', links: ['']);
      expect(parts(span).join(), 'Matn');
    });
  });
}

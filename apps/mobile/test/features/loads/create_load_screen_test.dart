import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/core/theme/app_theme.dart';
import 'package:karvon/features/loads/data/loads_repository.dart';
import 'package:karvon/features/loads/domain/load.dart';
import 'package:karvon/features/loads/presentation/create_load_screen.dart';
import 'package:karvon/features/loads/presentation/feed_screen.dart'
    show loadsRepositoryProvider;
import 'package:karvon/features/reference/domain/reference_data.dart';
import 'package:karvon/features/reference/presentation/reference_providers.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/localized_app.dart';

class _MockLoadsRepository extends Mock implements LoadsRepository {}

/// Yuk e'lon qilish formasi.
///
/// ENG MUHIM TEKSHIRUV: "Davom etish" tugmasi to'ldirilmagan
/// bosqichda O'CHIQ turadi. Aks holda foydalanuvchi oxirigacha borib,
/// serverdan xato oladi va qayerga qaytishni bilmaydi — bu bizning
/// asosiy konversiya oqimimiz.
void main() {
  late _MockLoadsRepository repository;

  const bundle = ReferenceBundle(
    version: 'test',
    regions: [
      Region(
        id: 1,
        code: 'TAS_C',
        name: LocalizedName(uz: 'Toshkent shahri', ru: 'Ташкент', en: ''),
        lat: 41.3,
        lng: 69.24,
        districts: [],
      ),
    ],
    vehicleTypes: [
      VehicleType(
        id: 4,
        code: 'TRUCK_5T',
        name: LocalizedName(uz: 'Yuk mashinasi 5t', ru: 'Грузовик 5т', en: ''),
        minCapacityKg: 3000,
        maxCapacityKg: 5000,
        typicalVolumeM3: 25,
      ),
    ],
    bodyTypes: [
      BodyType(
        id: 1,
        code: 'TENT',
        name: LocalizedName(uz: 'Tentli', ru: 'Тент', en: ''),
        isTemperatureControlled: false,
      ),
    ],
    cargoCategories: [
      CargoCategory(
        id: 3,
        code: 'FURNITURE',
        name: LocalizedName(uz: 'Mebel', ru: 'Мебель', en: ''),
        requiresSpecialPermit: false,
      ),
      CargoCategory(
        id: 9,
        code: 'DANGEROUS',
        name: LocalizedName(uz: 'Xavfli yuk', ru: 'Опасный груз', en: ''),
        requiresSpecialPermit: true,
      ),
    ],
    specialRequirements: [],
  );

  setUp(() {
    repository = _MockLoadsRepository();
  });

  Future<void> pump(WidgetTester tester, {AppLocale locale = testLocale}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          loadsRepositoryProvider.overrideWithValue(repository),
          // `FutureProvider` ni tayyor qiymat bilan almashtiramiz:
          // testda tarmoq so'rovi bo'lmasligi kerak
          referenceProvider.overrideWith((ref) => Future.value(bundle)),
        ],
        child: localizedApp(
          theme: AppTheme.light,
          locale: locale,
          home: const CreateLoadScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Ekrandagi "Davom etish" tugmasi bosiladigan holatdami.
  bool canContinue(WidgetTester tester) {
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Davom etish'),
    );
    return button.onPressed != null;
  }

  /// 1-bosqichni minimal toʻldiradi.
  Future<void> fillCargoStep(WidgetTester tester) async {
    await tester.enterText(
      find.widgetWithText(TextField, 'Masalan: Mebel — 5 ta shkaf'),
      'Mebel',
    );
    await tester.pump();

    await tester.tap(find.text('Mebel').last);
    await tester.pump();

    await tester.enterText(find.widgetWithText(TextField, '4000'), '4000');
    await tester.pump();
  }

  testWidgets('★ BOʻSH FORMADA DAVOM ETISH OʻCHIQ', (tester) async {
    await pump(tester);

    expect(find.text('Yuk'), findsWidgets);
    expect(canContinue(tester), isFalse);
  });

  testWidgets('spravochnik kategoriyalari koʻrsatiladi', (tester) async {
    await pump(tester);

    expect(find.text('Mebel'), findsOneWidget);
    expect(find.text('Xavfli yuk'), findsOneWidget);
  });

  testWidgets('★ NOM, KATEGORIYA VA OGʻIRLIK — UCHALASI KERAK', (tester) async {
    await pump(tester);

    // Faqat nom
    await tester.enterText(find.widgetWithText(TextField, 'Masalan: Mebel — 5 ta shkaf'), 'Mebel');
    await tester.pump();
    expect(canContinue(tester), isFalse, reason: 'kategoriya va ogʻirlik yoʻq');

    // + kategoriya
    await tester.tap(find.text('Mebel').last);
    await tester.pump();
    expect(canContinue(tester), isFalse, reason: 'ogʻirlik hali yoʻq');

    // + ogʻirlik
    await tester.enterText(find.widgetWithText(TextField, '4000'), '4000');
    await tester.pump();
    expect(canContinue(tester), isTrue);
  });

  testWidgets('★ MAXSUS RUXSATNOMA HAQIDA OGOHLANTIRADI', (tester) async {
    await pump(tester);

    expect(find.textContaining('ruxsatnoma'), findsNothing);

    await tester.tap(find.text('Xavfli yuk'));
    await tester.pump();

    // Yo'lda to'xtatilishidan oldin aytish kerak
    expect(find.textContaining('ruxsatnoma'), findsOneWidget);
  });

  testWidgets('ogʻirlikka mos transport eslatiladi', (tester) async {
    await pump(tester);

    await tester.enterText(find.widgetWithText(TextField, '4000'), '4000');
    await tester.pump();

    expect(find.textContaining('Yuk mashinasi 5t'), findsOneWidget);
  });

  testWidgets('★ SIGʻMAYDIGAN OGʻIRLIKDA OGOHLANTIRISH', (tester) async {
    await pump(tester);

    // 20 tonna — spravochnikdagi hech bir transport koʻtara olmaydi
    await tester.enterText(find.widgetWithText(TextField, '4000'), '20000');
    await tester.pump();

    expect(find.textContaining('mos transport topilmadi'), findsOneWidget);
  });

  testWidgets('ikkinchi bosqichga oʻtadi', (tester) async {
    await pump(tester);
    await fillCargoStep(tester);

    await tester.tap(find.text('Davom etish'));
    await tester.pumpAndSettle();

    expect(find.text('Manzil va vaqt'), findsOneWidget);
    expect(find.text('Yuk olish'), findsOneWidget);
    expect(find.text('Yetkazish'), findsOneWidget);
    // Manzilsiz davom etib boʻlmaydi
    expect(canContinue(tester), isFalse);
  });

  testWidgets('★ SERVERGA HECH QANDAY SOʻROV KETMAYDI', (tester) async {
    await pump(tester);
    await fillCargoStep(tester);

    await tester.tap(find.text('Davom etish'));
    await tester.pumpAndSettle();

    // Manzil tanlanmaguncha na narx tavsiyasi, na yaratish soʻrovi
    verifyNever(() => repository.create(any()));
    verifyNever(
      () => repository.estimate(
        fromLat: any(named: 'fromLat'),
        fromLng: any(named: 'fromLng'),
        toLat: any(named: 'toLat'),
        toLng: any(named: 'toLng'),
        weightKg: any(named: 'weightKg'),
      ),
    );
  });

  testWidgets('orqaga qaytish birinchi bosqichda ekranni yopadi', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          loadsRepositoryProvider.overrideWithValue(repository),
          referenceProvider.overrideWith((ref) => Future.value(bundle)),
        ],
        child: localizedApp(
          theme: AppTheme.light,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<Load>(
                      builder: (_) => const CreateLoadScreen(),
                    ),
                  ),
                  child: const Text('Ochish'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Ochish'));
    await tester.pumpAndSettle();
    expect(find.byType(CreateLoadScreen), findsOneWidget);

    // 1-bosqichda "orqaga" — bu butun formani yopish degani
    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();

    expect(find.byType(CreateLoadScreen), findsNothing);
    expect(find.text('Ochish'), findsOneWidget);
  });

  testWidgets('★ IKKINCHI BOSQICHDAN ORQAGA — BIRINCHISIGA QAYTADI', (tester) async {
    await pump(tester);
    await fillCargoStep(tester);

    await tester.tap(find.text('Davom etish'));
    await tester.pumpAndSettle();
    expect(find.text('Manzil va vaqt'), findsOneWidget);

    // Ekran yopilmaydi — oldingi bosqichga qaytadi va kiritilgan
    // maʼlumot saqlanadi
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();

    expect(find.text('Yuk haqida'), findsOneWidget);
    expect(canContinue(tester), isTrue, reason: 'toʻldirilgan maʼlumot saqlandi');
  });

  group('ruscha interfeys', () {
    testWidgets('★ SPRAVOCHNIK NOMLARI HAM JORIY TILDA', (tester) async {
      // Avval `name.uz` qotib yozilgan edi: interfeys ruscha, lekin
      // kategoriya va transport nomlari o'zbekcha chiqardi
      await pump(tester, locale: AppLocale.ru);

      expect(find.text('Груз'), findsWidgets);
      expect(find.text('О грузе'), findsOneWidget);
      expect(find.text('Мебель'), findsOneWidget);
      expect(find.text('Mebel'), findsNothing);

      await tester.enterText(find.widgetWithText(TextField, '4000'), '4000');
      await tester.pump();

      expect(find.text('Подходящий транспорт: Грузовик 5т'), findsOneWidget);
    });

    testWidgets('★ OQIM RUSCHA HAM ISHLAYDI', (tester) async {
      await pump(tester, locale: AppLocale.ru);

      // Har kiritishdan keyin kadr chiziladi: aks holda keyingi maydon
      // eski qoralamani ushlab qoladi va oldingi qiymatni o'chiradi
      // (haqiqiy foydalanuvchida kadrlar orasida doim vaqt bor)
      // Nom maydoni — birinchi matn maydoni
      await tester.enterText(find.byType(TextField).first, 'Шкафы');
      await tester.pump();
      await tester.tap(find.text('Мебель'));
      await tester.pump();
      await tester.enterText(find.widgetWithText(TextField, '4000'), '4000');
      await tester.pump();

      await tester.tap(find.text('Продолжить'));
      await tester.pumpAndSettle();

      expect(find.text('Адрес и время'), findsOneWidget);
      expect(find.text('Погрузка'), findsOneWidget);
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/core/location/device_location.dart';
import 'package:karvon/features/loads/data/loads_repository.dart';
import 'package:karvon/features/loads/presentation/widgets/feed_filter_sheet.dart';
import 'package:karvon/features/reference/domain/reference_data.dart';
import 'package:karvon/features/reference/presentation/reference_providers.dart';

import '../../helpers/localized_app.dart';

/// Lenta filtri.
///
/// ENG MUHIM: filtr faqat "Natijalarni koʻrsatish" bosilganda qoʻllanadi
/// va oyna yopilsa hech narsa oʻzgarmaydi. Notoʻgʻri kiritilgan qiymat
/// (eng kami > eng koʻpi) serverga ketmaydi — aks holda haydovchi boʻsh
/// lentani koʻrib "yuk yoʻq" deb oʻylaydi.
void main() {
  const bundle = ReferenceBundle(
    version: 'test',
    regions: [
      Region(
        id: 1,
        code: 'TAS_C',
        name: LocalizedName(uz: 'Toshkent shahri', ru: 'Ташкент', en: 'Tashkent'),
        lat: 41.3,
        lng: 69.24,
        districts: [],
      ),
      Region(
        id: 8,
        code: 'SAM',
        name: LocalizedName(uz: 'Samarqand', ru: 'Самарканд', en: 'Samarkand'),
        lat: 39.65,
        lng: 66.96,
        districts: [],
      ),
    ],
    vehicleTypes: [
      VehicleType(
        id: 4,
        code: 'TRUCK_5T',
        name: LocalizedName(uz: 'Yuk mashinasi 5t', ru: 'Грузовик 5т', en: '5t truck'),
        minCapacityKg: 3000,
        maxCapacityKg: 5000,
        typicalVolumeM3: 25,
      ),
    ],
    bodyTypes: [],
    cargoCategories: [],
    specialRequirements: [],
  );

  LoadFilter? result;
  var closed = false;

  Future<void> open(
    WidgetTester tester, {
    LoadFilter initial = const LoadFilter(),
    DeviceLocation? location,
    AppLocale locale = testLocale,
  }) async {
    result = null;
    closed = false;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          referenceProvider.overrideWith((ref) => Future.value(bundle)),
          // Testda platforma kanali yoʻq — haqiqiy GPS javob bermaydi
          locationResolverProvider.overrideWithValue(() async => location),
        ],
        child: localizedApp(
          locale: locale,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () async {
                    result = await showFeedFilterSheet(context, initial);
                    closed = true;
                  },
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
  }

  /// Oyna roʻyxati dangasa quriladi: pastdagi element hali mavjud
  /// boʻlmasligi mumkin — avval aylantirib chiqaramiz. Birinchi
  /// `Scrollable` — oynaning roʻyxati (asosiy sahifada aylantirish yoʻq).
  Future<void> reveal(WidgetTester tester, Finder finder) async {
    await tester.scrollUntilVisible(finder, 150, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
  }

  Future<void> tapVisible(WidgetTester tester, Finder finder) async {
    await reveal(tester, finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> apply(WidgetTester tester) async {
    // Tugma roʻyxatdan tashqarida — doim koʻrinadi
    await tester.tap(find.text('Natijalarni koʻrsatish'));
    await tester.pumpAndSettle();
  }

  testWidgets('★ YOʻNALISH VA OGʻIRLIK FILTRGA TUSHADI', (tester) async {
    await open(tester);

    // "Qayerdan" boʻlimi "Qayerga" dan oldin — birinchi uchragani
    await tapVisible(tester, find.text('Toshkent shahri').first);
    await tapVisible(tester, find.text('Samarqand').last);

    final minWeight = find.widgetWithText(TextField, '1000');
    await reveal(tester, minWeight);
    await tester.enterText(minWeight, '2000');
    await tester.pump();

    await apply(tester);

    expect(closed, isTrue);
    expect(result!.fromRegionId, 1);
    expect(result!.toRegionId, 8);
    expect(result!.minWeightKg, 2000);
    expect(result!.maxWeightKg, isNull);
    // Yoʻnalish ikkita filtr, ogʻirlik bitta — tugmadagi belgi shu
    expect(result!.activeCount, 3);
  });

  testWidgets('transport turi va narx', (tester) async {
    await open(tester);

    await tapVisible(tester, find.text('Yuk mashinasi 5t'));

    final price = find.widgetWithText(TextField, '1 000 000');
    await reveal(tester, price);
    await tester.enterText(price, '2500000');
    await tester.pump();

    await apply(tester);

    expect(result!.vehicleTypeIds, [4]);
    // Pul tiyinda va satr: 2 500 000 soʻm × 100
    expect(result!.minPriceTiyin, '250000000');
  });

  testWidgets('★ EN KAMI EN KOʻPIDAN KATTA — NATIJA KOʻRSATILMAYDI', (tester) async {
    await open(tester);

    final minWeight = find.widgetWithText(TextField, '1000');
    await reveal(tester, minWeight);
    await tester.enterText(minWeight, '5000');
    await tester.enterText(find.widgetWithText(TextField, '20000'), '1000');
    await tester.pumpAndSettle();

    expect(find.textContaining('boʻlmasligi kerak'), findsOneWidget);
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Natijalarni koʻrsatish'),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('★ TOZALASH HAMMA NARSANI QAYTARADI', (tester) async {
    await open(
      tester,
      initial: const LoadFilter(
        fromRegionId: 1,
        minWeightKg: 1000,
        vehicleTypeIds: [4],
        minPriceTiyin: '100000000',
        sort: 'price_desc',
      ),
    );

    await tester.tap(find.text('Tozalash'));
    await tester.pumpAndSettle();
    await apply(tester);

    expect(result!.isEmpty, isTrue);
    expect(result!.sort, 'match_score');
  });

  testWidgets('★ OYNA YOPILSA FILTR OʻZGARMAYDI', (tester) async {
    await open(tester, initial: const LoadFilter(fromRegionId: 1));

    await tapVisible(tester, find.text('Samarqand').first);
    // Oyna tashqarisiga bosish — bekor qilish
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    expect(closed, isTrue);
    expect(result, isNull);
  });

  testWidgets('★ "MENGA YAQIN" JOYLASHUVSIZ TANLANMAYDI', (tester) async {
    await open(tester);

    await tapVisible(tester, find.text('Menga yaqin'));

    // Nima qilish kerakligi aytiladi, saralash esa oʻzgarmaydi
    expect(find.textContaining('joylashuvga ruxsat'), findsOneWidget);
    await apply(tester);
    expect(result!.sort, 'match_score');
    expect(result!.lat, isNull);
  });

  testWidgets('joylashuv bor — yaqinlik boʻyicha saralanadi', (tester) async {
    await open(tester, location: const DeviceLocation(lat: 41.31, lng: 69.28));

    await tapVisible(tester, find.text('Menga yaqin'));
    await apply(tester);

    expect(result!.sort, 'distance_asc');
    expect(result!.lat, 41.31);
    expect(result!.lng, 69.28);
  });

  testWidgets('★ RUSCHA: SARLAVHA VA VILOYAT NOMLARI', (tester) async {
    await open(tester, locale: AppLocale.ru);

    expect(find.text('Фильтр'), findsOneWidget);
    expect(find.text('Ташкент'), findsWidgets);
    expect(find.text('Toshkent shahri'), findsNothing);
    expect(find.text('Показать результаты'), findsOneWidget);
  });
}

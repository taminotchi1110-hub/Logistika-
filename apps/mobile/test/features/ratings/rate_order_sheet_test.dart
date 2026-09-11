import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/theme/app_theme.dart';
import 'package:karvon/features/ratings/data/ratings_repository.dart';
import 'package:karvon/features/ratings/domain/rating.dart';
import 'package:karvon/features/ratings/presentation/rate_order_sheet.dart';
import 'package:karvon/features/ratings/presentation/rating_providers.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/localized_app.dart';

class _MockRatingsRepository extends Mock implements RatingsRepository {}

/// Baho berish oynasi.
///
/// ENG MUHIM: foydalanuvchi bahosi DARHOL KO'RINMASLIGINI bilishi
/// kerak. Aks holda "yubordim, lekin hech nima bo'lmadi" deb qayta
/// yuborishga urinadi va ko'r-ko'rona sxema tushunarsiz bo'lib qoladi.
void main() {
  late _MockRatingsRepository repository;

  setUpAll(() {
    registerFallbackValue(const RatingDraft());
  });

  setUp(() {
    repository = _MockRatingsRepository();
    when(() => repository.submit(any(), any())).thenAnswer(
      (_) async => Rating.fromJson(const {
        'id': 'r-1',
        'orderId': 'o-1',
        'score': 5,
        'direction': 'SHIPPER_TO_DRIVER',
        'isVisible': false,
        'createdAt': '2026-09-09T11:00:00.000Z',
      }),
    );
  });

  Future<void> open(WidgetTester tester, {bool isRatingDriver = true}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [ratingsRepositoryProvider.overrideWithValue(repository)],
        child: localizedApp(
          theme: AppTheme.light,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => showRateOrderSheet(
                    context,
                    orderId: 'o-1',
                    counterpartyName: 'Anvar Karimov',
                    isRatingDriver: isRatingDriver,
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
  }

  /// "Baho berish" tugmasi bosiladigan holatdami.
  bool canSubmit(WidgetTester tester) {
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Baho berish'),
    );
    return button.onPressed != null;
  }

  testWidgets('★ YULDUZSIZ YUBORIB BOʻLMAYDI', (tester) async {
    await open(tester);

    expect(find.text('Yulduzni tanlang'), findsOneWidget);
    expect(canSubmit(tester), isFalse);
  });

  testWidgets('★ YULDUZ TANLANGACH TUGMA YOQILADI', (tester) async {
    await open(tester);

    // Beshinchi yulduz
    await tester.tap(find.byIcon(Icons.star_outline_rounded).at(4));
    await tester.pumpAndSettle();

    expect(canSubmit(tester), isTrue);
    // Raqam oʻzi hech narsa demaydi — matn bilan tushuntiriladi
    expect(find.text('Aʼlo'), findsOneWidget);
  });

  testWidgets('baho matni yulduzga mos keladi', (tester) async {
    await open(tester);

    await tester.tap(find.byIcon(Icons.star_outline_rounded).first);
    await tester.pumpAndSettle();
    expect(find.text('Juda yomon'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.star_outline_rounded).at(1));
    await tester.pumpAndSettle();
    expect(find.text('Oʻrtacha'), findsOneWidget);
  });

  testWidgets('★ YUK HOLATI FAQAT HAYDOVCHINI BAHOLASHDA', (tester) async {
    // Haydovchi mijozning yukini baholay olmaydi: u yukni koʻrgan,
    // lekin uni tayyorlamagan
    await open(tester, isRatingDriver: true);

    expect(find.text('Haydovchini baholang'), findsOneWidget);
    expect(find.text('Yuk holati'), findsOneWidget);
  });

  testWidgets('★ MIJOZNI BAHOLASHDA YUK HOLATI YOʻQ', (tester) async {
    await open(tester, isRatingDriver: false);

    expect(find.text('Yuk beruvchini baholang'), findsOneWidget);
    expect(find.text('Yuk holati'), findsNothing);
    // Qolgan mezonlar oʻrnida turadi
    expect(find.text('Vaqtida'), findsOneWidget);
    expect(find.text('Muomala'), findsOneWidget);
  });

  testWidgets('★ KOʻR-KOʻRONA SXEMA TUSHUNTIRILADI', (tester) async {
    await open(tester);

    expect(
      find.textContaining('hamkor ham baho bermaguncha yashirin'),
      findsOneWidget,
    );
  });

  testWidgets('★ FAQAT TOʻLDIRILGAN MEZONLAR YUBORILADI', (tester) async {
    await open(tester);

    // Umumiy baho — 4 yulduz
    await tester.tap(find.byIcon(Icons.star_outline_rounded).at(3));
    await tester.pumpAndSettle();

    // Tugma test oynasidan pastda — avval koʻrinadigan qilamiz
    await tester.ensureVisible(find.text('Baho berish'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Baho berish'));
    await tester.pumpAndSettle();

    final captured = verify(() => repository.submit('o-1', captureAny())).captured;
    final draft = captured.single as RatingDraft;

    expect(draft.score, 4);
    expect(draft.punctuality, isNull);
    expect(draft.toJson().containsKey('punctuality'), isFalse);
  });

  testWidgets('izoh yuboriladi', (tester) async {
    await open(tester);

    await tester.tap(find.byIcon(Icons.star_outline_rounded).at(4));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Vaqtida yetkazdi');
    await tester.pumpAndSettle();

    // Tugma test oynasidan pastda — avval koʻrinadigan qilamiz
    await tester.ensureVisible(find.text('Baho berish'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Baho berish'));
    await tester.pumpAndSettle();

    final captured = verify(() => repository.submit('o-1', captureAny())).captured;
    expect((captured.single as RatingDraft).comment, 'Vaqtida yetkazdi');
  });
}

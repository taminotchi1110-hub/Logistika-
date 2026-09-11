import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/location/device_location.dart';
import 'package:karvon/core/theme/app_theme.dart';
import 'package:karvon/features/orders/data/orders_repository.dart';
import 'package:karvon/features/orders/domain/order.dart';
import 'package:karvon/features/orders/presentation/order_detail_screen.dart';
import 'package:karvon/features/orders/presentation/orders_screen.dart';
import 'package:karvon/features/ratings/domain/rating.dart';
import 'package:karvon/features/ratings/presentation/rating_providers.dart';
import 'package:mocktail/mocktail.dart';
import 'package:karvon/core/l10n/locale_controller.dart';

import '../../helpers/localized_app.dart';

class _MockOrdersRepository extends Mock implements OrdersRepository {}

/// Buyurtma tafsiloti — reysning boshqaruv paneli.
///
/// ENG MUHIM TEKSHIRUV: tugmalar SERVERDAN kelgan `nextAllowed`
/// ro'yxatidan quriladi. Ilova o'z state machine'ini yuritsa, u
/// server bilan bir kunmas-bir kun ajralib qoladi va foydalanuvchi
/// bosgan tugma 409 qaytaradi.
void main() {
  late _MockOrdersRepository repository;

  setUpAll(() {
    registerFallbackValue(OrderStatus.confirmed);
  });

  setUp(() {
    repository = _MockOrdersRepository();
  });

  Order order({
    String status = 'ASSIGNED',
    String statusLabel = 'Haydovchi tanlandi',
    List<String> nextAllowed = const ['CONFIRMED', 'CANCELLED_BY_DRIVER'],
    bool phoneRevealed = false,
    bool emergencyAvailable = true,
    String counterpartyRole = 'DRIVER',
  }) =>
      Order.fromJson({
        'id': 'o-1',
        'publicNo': '195',
        'status': status,
        'statusLabel': statusLabel,
        'nextAllowed': nextAllowed,
        'priceTiyin': 200000000,
        'commissionTiyin': 8000000,
        'driverPayoutTiyin': 192000000,
        'paymentMethod': 'CASH',
        'paymentStatus': 'CREATED',
        'load': {
          'id': 'l-1',
          'title': 'Mebel',
          'weightKg': 4000,
          'pickupAddress': 'Toshkent, Yunusobod 108',
          'pickupLat': 41.3111,
          'pickupLng': 69.2797,
          'deliveryAddress': 'Samarqand, Registon',
          'deliveryLat': 39.6542,
          'deliveryLng': 66.9597,
          'distanceKm': 328.34,
          'durationMin': 318,
        },
        'counterparty': {
          'id': 'u-1',
          'firstName': 'Anvar',
          'lastName': 'Karimov',
          'phone': phoneRevealed ? '+998901234567' : '+998 90 *** ** 67',
          'ratingAvg': 4.8,
          'ratingCount': 12,
          'role': counterpartyRole,
        },
        'vehicle': {
          'id': 'v-1',
          'brand': 'Isuzu',
          'model': 'NPR',
          'plateNumber': '01A123BC',
        },
        'visibility': {
          'pickupPhone': phoneRevealed,
          'deliveryPhone': false,
          'counterpartyPhone': phoneRevealed,
          'chatEnabled': true,
          'chatReadOnly': false,
          'emergencyRevealAvailable': emergencyAvailable,
        },
        'conversationId': 'c-1',
        'createdAt': '2026-09-08T10:00:00.000Z',
      });

  final history = [
    OrderHistoryEntry.fromJson({
      'status': 'ASSIGNED',
      'statusLabel': 'Haydovchi tanlandi',
      'actorRole': 'SHIPPER',
      'note': 'Taklif qabul qilindi',
      'at': '2026-09-08T10:00:00.000Z',
    }),
  ];

  Future<void> pump(
    WidgetTester tester,
    Order value, {
    List<OrderHistoryEntry>? entries,
    DeviceLocation? location,
    List<Rating> ratings = const [],
    AppLocale locale = testLocale,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ordersRepositoryProvider.overrideWithValue(repository),
          orderProvider('o-1').overrideWith((ref) => Future.value(value)),
          orderHistoryEntriesProvider('o-1')
              .overrideWith((ref) => Future.value(entries ?? history)),
          // Baho bloki yuk topshirilgandan keyin chiziladi va soʻrov
          // yuboradi — testda uni ham almashtiramiz
          orderRatingsProvider('o-1').overrideWith((ref) => Future.value(ratings)),
          // Testda platforma kanali yo'q va haqiqiy `Geolocator`
          // chaqiruvi javob qaytarmaydi
          locationResolverProvider.overrideWithValue(() async => location),
        ],
        child: localizedApp(
          theme: AppTheme.light,
          locale: locale,
          home: const OrderDetailScreen(orderId: 'o-1'),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Uzun ro'yxatda pastdagi blokni ko'rinadigan qiladi.
  Future<void> scrollTo(WidgetTester tester, Finder target) async {
    await tester.scrollUntilVisible(target, 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
  }

  testWidgets('★ TUGMA SERVERDAN KELGAN NEXTALLOWED DAN QURILADI', (tester) async {
    await pump(tester, order(nextAllowed: ['CONFIRMED', 'CANCELLED_BY_DRIVER']));

    // "CONFIRMED" statusi tugmada BUYRUQ shaklida
    expect(find.text('Tasdiqlayman'), findsOneWidget);
    expect(find.text('Bekor qilish'), findsOneWidget);
    // Server ruxsat bermagan qadam koʻrinmaydi
    expect(find.text('Yukni ortdim'), findsNothing);
  });

  testWidgets('boshqa bosqichda boshqa tugma', (tester) async {
    await pump(
      tester,
      order(
        status: 'ARRIVED_AT_PICKUP',
        statusLabel: 'Yuk olish nuqtasida',
        nextAllowed: ['LOADED', 'CANCELLED_BY_DRIVER'],
        phoneRevealed: true,
        emergencyAvailable: false,
      ),
    );

    expect(find.text('Yukni ortdim'), findsOneWidget);
    expect(find.text('Tasdiqlayman'), findsNothing);
  });

  testWidgets('★ YOPILGAN BUYURTMADA AMAL PANELI YOʻQ', (tester) async {
    await pump(
      tester,
      order(status: 'CLOSED', statusLabel: 'Yopildi', nextAllowed: const []),
    );

    expect(find.text('Tasdiqlayman'), findsNothing);
    expect(find.text('Bekor qilish'), findsNothing);
  });

  testWidgets('★ TELEFON YOPIQ — "BOGʻLANA OLMAYAPMAN" KOʻRINADI', (tester) async {
    await pump(tester, order());

    expect(find.text('Bogʻlana olmayapman'), findsOneWidget);
    expect(find.text('Qoʻngʻiroq'), findsNothing);
    // Foydalanuvchiga NEGA yopiqligi tushuntiriladi
    expect(find.textContaining('yuk olish nuqtasiga yetib borgach'), findsOneWidget);
  });

  testWidgets('★ TELEFON OCHILGACH QOʻNGʻIROQ TUGMASI CHIQADI', (tester) async {
    await pump(
      tester,
      order(
        status: 'ARRIVED_AT_PICKUP',
        nextAllowed: ['LOADED'],
        phoneRevealed: true,
        emergencyAvailable: false,
      ),
    );

    expect(find.text('Qoʻngʻiroq'), findsOneWidget);
    expect(find.text('Bogʻlana olmayapman'), findsNothing);
    expect(find.text('+998901234567'), findsOneWidget);
  });

  testWidgets('★ BEKOR QILISHDA SABAB MAJBURIY', (tester) async {
    await pump(tester, order());

    await tester.tap(find.text('Bekor qilish'));
    await tester.pumpAndSettle();

    // Dialogdagi tasdiq tugmasi — sababsiz oʻchiq
    final confirm = find.widgetWithText(TextButton, 'Bekor qilish').last;
    expect(tester.widget<TextButton>(confirm).onPressed, isNull);

    await tester.enterText(find.byType(TextField), 'Mijoz rad etdi');
    await tester.pumpAndSettle();
    expect(tester.widget<TextButton>(confirm).onPressed, isNotNull);
  });

  testWidgets('oddiy qadamda tasdiq soʻralmaydi', (tester) async {
    when(() => repository.changeStatus(
          any(),
          any(),
          note: any(named: 'note'),
          lat: any(named: 'lat'),
          lng: any(named: 'lng'),
        )).thenAnswer((_) async => order(status: 'CONFIRMED'));

    await pump(tester, order());

    await tester.tap(find.text('Tasdiqlayman'));
    await tester.pumpAndSettle();

    // Dialog chiqmaydi — har bosishda tasdiq soʻrash haydovchini
    // charchatadi va u oʻqimasdan bosishga oʻrganib qoladi
    expect(find.byType(AlertDialog), findsNothing);
    verify(() => repository.changeStatus(
          'o-1',
          OrderStatus.confirmed,
          note: any(named: 'note'),
          lat: any(named: 'lat'),
          lng: any(named: 'lng'),
        )).called(1);
  });

  testWidgets('★ TOPSHIRISHDA TASDIQ SOʻRALADI', (tester) async {
    await pump(
      tester,
      order(
        status: 'ARRIVED_AT_DELIVERY',
        nextAllowed: ['DELIVERED'],
        phoneRevealed: true,
        emergencyAvailable: false,
      ),
    );

    await tester.tap(find.text('Yukni topshirdim'));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.textContaining('marshrutni oʻzgartirib boʻlmaydi'), findsOneWidget);
    // Izoh ixtiyoriy — tugma darhol faol
    final confirm = find.widgetWithText(TextButton, 'Tasdiqlash');
    expect(tester.widget<TextButton>(confirm).onPressed, isNotNull);
  });

  testWidgets('★ VAQT CHIZIGʻI KELGUSI BOSQICHLARNI HAM KOʻRSATADI', (tester) async {
    await pump(tester, order());
    await scrollTo(tester, find.text('Yetkazib berildi'));

    // Faqat bajarilganini koʻrsatish reysni tugagandek his qildiradi
    // va "haydovchi qayerda qoldi?" degan qoʻngʻiroqlarni koʻpaytiradi
    expect(find.text('Yuk ortildi'), findsOneWidget);
    expect(find.text('Yetkazib berildi'), findsOneWidget);
    // Tarixdagi izoh chiziqda koʻrinadi
    expect(find.text('Taklif qabul qilindi'), findsOneWidget);
  });

  testWidgets('moliya bloki mijozga komissiyani koʻrsatmaydi', (tester) async {
    // `counterparty.role == DRIVER` — demak foydalanuvchi MIJOZ
    await pump(tester, order());
    await scrollTo(tester, find.text('Buyurtma narxi'));

    expect(find.text('Buyurtma narxi'), findsOneWidget);
    expect(find.text('Sizga tushadi'), findsNothing);
    expect(find.text('Platforma komissiyasi'), findsNothing);
  });

  testWidgets('★ HAYDOVCHIGA QOʻLGA TEGADIGAN SUMMA KOʻRSATILADI', (tester) async {
    // Hamkor SHIPPER — demak foydalanuvchining oʻzi HAYDOVCHI
    await pump(tester, order(counterpartyRole: 'SHIPPER'));
    await scrollTo(tester, find.text('Sizga tushadi'));

    expect(find.text('Platforma komissiyasi'), findsOneWidget);
    expect(find.text('Sizga tushadi'), findsOneWidget);
  });

  // ------------------------------------------------------------- baho

  Rating rating({
    required String direction,
    int score = 5,
    String? comment,
  }) =>
      Rating.fromJson({
        'id': 'r-$direction',
        'orderId': 'o-1',
        'score': score,
        'direction': direction,
        'isVisible': true,
        'comment': comment,
        'createdAt': '2026-09-09T11:00:00.000Z',
      });

  testWidgets('★ BAHO BLOKI YUK TOPSHIRILGUNCHA KOʻRINMAYDI', (tester) async {
    // Undan oldin baholash uchun asos yoʻq va server ham rad etadi
    await pump(tester, order(status: 'IN_TRANSIT', nextAllowed: ['ARRIVED_AT_DELIVERY']));

    expect(find.text('Baho berish'), findsNothing);
  });

  testWidgets('★ TOPSHIRILGACH BAHO TUGMASI CHIQADI', (tester) async {
    await pump(tester, order(status: 'DELIVERED', nextAllowed: const []));
    await scrollTo(tester, find.text('Baho berish'));

    expect(find.text('Baho berish'), findsOneWidget);
  });

  testWidgets('★ BAHO BERILGACH "YASHIRIN TURIBDI" DEYILADI', (tester) async {
    // Bu holatni yashirish eng koʻp savol tugʻdiradigan xato boʻlardi:
    // foydalanuvchi baho yuborgan, lekin hech qayerda koʻrmagan
    await pump(
      tester,
      order(status: 'COMPLETED', nextAllowed: const []),
      ratings: [rating(direction: 'SHIPPER_TO_DRIVER', comment: 'Zoʻr')],
    );
    await scrollTo(tester, find.text('Sizning bahongiz'));

    expect(find.text('Sizning bahongiz'), findsOneWidget);
    expect(find.text('Zoʻr'), findsOneWidget);
    expect(find.textContaining('Hamkor hali baho bermagan'), findsOneWidget);
    expect(find.text('Baho berish'), findsNothing);
  });

  testWidgets('★ IKKALASI BAHO BERGACH IKKALASI KOʻRINADI', (tester) async {
    await pump(
      tester,
      order(status: 'COMPLETED', nextAllowed: const []),
      ratings: [
        rating(direction: 'SHIPPER_TO_DRIVER', comment: 'Zoʻr haydovchi'),
        rating(direction: 'DRIVER_TO_SHIPPER', score: 4, comment: 'Yaxshi mijoz'),
      ],
    );
    await scrollTo(tester, find.text('Hamkor bahosi'));

    expect(find.text('Sizning bahongiz'), findsOneWidget);
    expect(find.text('Hamkor bahosi'), findsOneWidget);
    expect(find.text('Yaxshi mijoz'), findsOneWidget);
    expect(find.textContaining('Hamkor hali baho bermagan'), findsNothing);
  });

  testWidgets('★ SERVER MATNI OʻZBEKCHA — EKRAN JORIY TILDA', (tester) async {
    // Server `statusLabel` ni hozircha doim oʻzbekcha yuboradi: ilova
    // tanilgan statusni oʻzi tarjima qiladi
    await pump(tester, order(), locale: AppLocale.ru);

    expect(find.text('Заказ №195'), findsOneWidget);
    expect(find.text('Водитель выбран'), findsWidgets);
    expect(find.text('Haydovchi tanlandi'), findsNothing);
    // Tugmalar ham buyruq shaklida va ruscha
    expect(find.text('Подтверждаю'), findsOneWidget);
    expect(find.text('Отменить заказ'), findsOneWidget);
  });
}

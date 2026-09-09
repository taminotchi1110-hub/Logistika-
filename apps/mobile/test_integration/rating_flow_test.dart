import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/features/orders/data/orders_repository.dart';
import 'package:karvon/features/orders/domain/order.dart';
import 'package:karvon/features/ratings/data/ratings_repository.dart';
import 'package:karvon/features/ratings/domain/rating.dart';

import 'support/memory_token_storage.dart';

/// Ikki tomonlama baho — HAQIQIY backend bilan.
///
/// KO'R-KO'RONA SXEMA — bu loyihaning muhim qarorlaridan biri va u
/// mijoz tomonida EMAS, serverda amalga oshirilgan. Test aynan shuni
/// tekshiradi: birinchi baho hamkorga ko'rinmasligi kerak.
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
void main() {
  final repoRoot = Directory.current.path.replaceAll(r'\', '/').replaceAll(
        RegExp(r'/apps/mobile/?$'),
        '',
      );

  const deliveryChain = [
    OrderStatus.confirmed,
    OrderStatus.enRouteToPickup,
    OrderStatus.arrivedAtPickup,
    OrderStatus.loaded,
    OrderStatus.inTransit,
    OrderStatus.arrivedAtDelivery,
    OrderStatus.delivered,
  ];

  Future<
      ({
        String orderId,
        String driverId,
        RatingsRepository shipper,
        RatingsRepository driver,
        OrdersRepository driverOrders,
      })> deliveredOrder() async {
    final result = await Process.run(
      'node',
      ['scripts/order-fixture.js'],
      workingDirectory: repoRoot,
    );

    if (result.exitCode != 0) {
      fail('Buyurtma fixture yaratilmadi: ${result.stderr}');
    }

    final data = jsonDecode('${result.stdout}'.trim()) as Map<String, dynamic>;

    ApiClient client(String token) {
      final storage = MemoryTokenStorage()
        ..saveTokens(accessToken: token, refreshToken: token);
      return ApiClient(storage: storage);
    }

    String subjectOf(String token) {
      final payload = base64Url.normalize(token.split('.')[1]);
      final claims =
          jsonDecode(utf8.decode(base64Url.decode(payload))) as Map<String, dynamic>;
      return claims['sub'] as String;
    }

    final driverApi = client(data['driverToken'] as String);
    final driverOrders = OrdersRepository(driverApi);
    final orderId = data['orderId'] as String;

    // Baho faqat yuk topshirilgandan keyin mumkin
    for (final status in deliveryChain) {
      await driverOrders.changeStatus(orderId, status);
    }

    return (
      orderId: orderId,
      driverId: subjectOf(data['driverToken'] as String),
      shipper: RatingsRepository(client(data['shipperToken'] as String)),
      driver: RatingsRepository(driverApi),
      driverOrders: driverOrders,
    );
  }

  test('★ BIRINCHI BAHO HAMKORGA KOʻRINMAYDI', () async {
    final fx = await deliveredOrder();

    final mine = await fx.shipper.submit(
      fx.orderId,
      const RatingDraft(
        score: 5,
        punctuality: 5,
        communication: 4,
        cargoCondition: 5,
        comment: 'Vaqtida yetkazdi, yuk butun',
      ),
    );

    expect(mine.score, 5);
    // Hali yashirin — hamkor javob bermagan
    expect(mine.isVisible, isFalse);
    expect(mine.direction, RatingDirection.shipperToDriver);

    // Oʻz bahomni koʻraman
    final ownView = await fx.shipper.forOrder(fx.orderId);
    expect(ownView, hasLength(1));

    // HAMKOR HECH NARSA KOʻRMAYDI — oʻch olishning oldi olinadi
    final partnerView = await fx.driver.forOrder(fx.orderId);
    expect(partnerView, isEmpty);

    // Ochiq profilda ham koʻrinmaydi
    expect(await fx.shipper.forUser(fx.driverId), isEmpty);
  });

  test('★ IKKINCHI BAHODAN KEYIN IKKALASI OCHILADI', () async {
    final fx = await deliveredOrder();

    await fx.shipper.submit(
      fx.orderId,
      const RatingDraft(score: 5, comment: 'Zoʻr haydovchi'),
    );
    await fx.driver.submit(
      fx.orderId,
      const RatingDraft(score: 4, comment: 'Yaxshi mijoz'),
    );

    final shipperView = await fx.shipper.forOrder(fx.orderId);
    final driverView = await fx.driver.forOrder(fx.orderId);

    expect(shipperView, hasLength(2));
    expect(driverView, hasLength(2));
    expect(shipperView.every((item) => item.isVisible), isTrue);

    // Ochiq profilda ham paydo boʻladi
    final publicRatings = await fx.shipper.forUser(fx.driverId);
    expect(publicRatings, hasLength(1));
    expect(publicRatings.first.comment, 'Zoʻr haydovchi');
    expect(publicRatings.first.raterName, isNotEmpty);
  });

  test('★ YUK TOPSHIRILMASDAN BAHO BERIB BOʻLMAYDI', () async {
    final result = await Process.run(
      'node',
      ['scripts/order-fixture.js'],
      workingDirectory: repoRoot,
    );
    final data = jsonDecode('${result.stdout}'.trim()) as Map<String, dynamic>;

    final storage = MemoryTokenStorage()
      ..saveTokens(
        accessToken: data['shipperToken'] as String,
        refreshToken: data['shipperToken'] as String,
      );
    final shipper = RatingsRepository(ApiClient(storage: storage));

    await expectLater(
      shipper.submit(data['orderId'] as String, const RatingDraft(score: 5)),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'RATING_NOT_ALLOWED_YET'),
      ),
    );
  });

  test('takroriy baho rad etiladi', () async {
    final fx = await deliveredOrder();

    await fx.shipper.submit(fx.orderId, const RatingDraft(score: 5));

    await expectLater(
      fx.shipper.submit(fx.orderId, const RatingDraft(score: 1)),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'RATING_ALREADY_GIVEN'),
      ),
    );
  });

  test('★ ESLATMA ROʻYXATI BAHODAN KEYIN TOZALANADI', () async {
    final fx = await deliveredOrder();

    final before = await fx.shipper.pending();
    final item = before.firstWhere((entry) => entry.orderId == fx.orderId);

    expect(item.publicNo, isNotEmpty);
    expect(item.counterpartyName, isNotEmpty);
    // Muddat kelajakda — foydalanuvchi qancha vaqti borligini bilishi kerak
    expect(item.deadline.isAfter(DateTime.now()), isTrue);
    expect(item.daysLeft, greaterThan(0));

    await fx.shipper.submit(fx.orderId, const RatingDraft(score: 5));

    final after = await fx.shipper.pending();
    expect(after.map((entry) => entry.orderId), isNot(contains(fx.orderId)));
  });

  test('★ HAYDOVCHI YUK HOLATINI BAHOLAY OLMAYDI', () async {
    final fx = await deliveredOrder();

    // Haydovchi yukni koʻrgan, lekin uni tayyorlamagan — bu mezon
    // faqat mijozdan haydovchiga
    await fx.driver.submit(
      fx.orderId,
      const RatingDraft(score: 5, cargoCondition: 5),
    );
    await fx.shipper.submit(fx.orderId, const RatingDraft(score: 5));

    final view = await fx.driver.forOrder(fx.orderId);
    final fromDriver = view.firstWhere(
      (item) => item.direction == RatingDirection.driverToShipper,
    );

    // Server maydonni jimgina tashlab yuboradi
    expect(fromDriver.cargoCondition, isNull);
  });

  test('notoʻgʻri ball rad etiladi', () async {
    final fx = await deliveredOrder();

    await expectLater(
      fx.shipper.submit(fx.orderId, const RatingDraft(score: 7)),
      throwsA(isA<ApiException>()),
    );
  });

  test('★ BEGONA BUYURTMAGA BAHO BERIB BOʻLMAYDI', () async {
    final mine = await deliveredOrder();
    final other = await deliveredOrder();

    await expectLater(
      mine.shipper.submit(other.orderId, const RatingDraft(score: 5)),
      throwsA(isA<ApiException>()),
    );
  });
}

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/features/orders/data/orders_repository.dart';
import 'package:karvon/features/orders/domain/order.dart';
import 'package:karvon/features/tracking/data/tracking_repository.dart';

import 'support/memory_token_storage.dart';

/// Jonli kuzatuv — HAQIQIY backend bilan.
///
/// ASOSIY QOIDA: joylashuv FAQAT reys davomida yoziladi. Buyurtmani
/// olish haydovchini doimiy nazoratga qo'ymaydi — bu maxfiylik qarori
/// va u backend tomonida ham mustaqil tekshiriladi.
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
void main() {
  final repoRoot = Directory.current.path.replaceAll(r'\', '/').replaceAll(
        RegExp(r'/apps/mobile/?$'),
        '',
      );

  Future<
      ({
        String orderId,
        OrdersRepository driverOrders,
        TrackingRepository driver,
        TrackingRepository shipper,
      })> fixture() async {
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

    final driverApi = client(data['driverToken'] as String);

    return (
      orderId: data['orderId'] as String,
      driverOrders: OrdersRepository(driverApi),
      driver: TrackingRepository(driverApi),
      shipper: TrackingRepository(client(data['shipperToken'] as String)),
    );
  }

  /// Toshkentdan Samarqand tomonga bir necha nuqta.
  List<Map<String, dynamic>> route(int count) {
    final now = DateTime.now().toUtc();
    return [
      for (var i = 0; i < count; i++)
        {
          'lat': 41.3111 - i * 0.01,
          'lng': 69.2797 - i * 0.02,
          'speedKmh': 70.0 + i,
          'recordedAt': now
              .subtract(Duration(seconds: (count - i) * 10))
              .toIso8601String(),
        },
    ];
  }

  test('★ REYS BOSHLANMAGUNCHA MARSHRUT YOZILMAYDI', () async {
    final fx = await fixture();

    // ASSIGNED holatida nuqta qabul qilinadi (matching keshi uchun),
    // lekin MARSHRUT TARIXIGA tushmaydi. Xato qaytarilmaydi: haydovchi
    // ilovasi reys holatini server bilan bir vaqtda bilmasligi mumkin.
    final recorded = await fx.driver.sendPoints(route(1));
    expect(recorded, isFalse);

    // Mijoz hech narsa koʻrmaydi
    expect(await fx.shipper.lastLocation(fx.orderId), isNull);
  });

  test('★ YOʻLGA CHIQQACH KUZATUV ISHLAYDI', () async {
    final fx = await fixture();

    await fx.driverOrders.changeStatus(fx.orderId, OrderStatus.confirmed);
    // CONFIRMED da ham hali yoʻq: haydovchi buyurtmani oldi, lekin
    // hali yoʻlga chiqmadi
    expect(await fx.shipper.lastLocation(fx.orderId), isNull);

    await fx.driverOrders.changeStatus(fx.orderId, OrderStatus.enRouteToPickup);
    await fx.driver.sendPoints(route(3));

    final live = await fx.shipper.lastLocation(fx.orderId);

    expect(live, isNotNull);
    expect(live!.orderId, fx.orderId);
    // Oxirgi nuqta qaytadi
    expect(live.lat, closeTo(41.3111 - 2 * 0.01, 1e-4));
    expect(live.target, 'PICKUP', reason: 'yuk hali ortilmagan');
    expect(live.distanceToTargetKm, greaterThan(0));
    expect(live.isStale, isFalse);
    expect(live.speedKmh, isNotNull);
  });

  test('★ YUK ORTILGACH MAQSAD YETKAZISHGA OʻZGARADI', () async {
    final fx = await fixture();

    for (final status in [
      OrderStatus.confirmed,
      OrderStatus.enRouteToPickup,
      OrderStatus.arrivedAtPickup,
      OrderStatus.loaded,
    ]) {
      await fx.driverOrders.changeStatus(fx.orderId, status);
    }

    await fx.driver.sendPoints(route(2));
    final live = await fx.shipper.lastLocation(fx.orderId);

    expect(live, isNotNull);
    expect(live!.target, 'DELIVERY');
    // Samarqandgacha ~300 km
    expect(live.distanceToTargetKm, greaterThan(100));
  });

  test('★ MARSHRUT POLYLINE SIFATIDA KELADI VA DEKODLANADI', () async {
    final fx = await fixture();

    await fx.driverOrders.changeStatus(fx.orderId, OrderStatus.confirmed);
    await fx.driverOrders.changeStatus(fx.orderId, OrderStatus.enRouteToPickup);
    await fx.driver.sendPoints(route(8));

    final track = await fx.shipper.track(fx.orderId);

    // Polyline dekodlangach haqiqiy koordinatalar chiqishi kerak
    expect(track.points.length, greaterThanOrEqualTo(2));
    expect(track.isEmpty, isFalse);
    expect(track.points.first.latitude, closeTo(41.3111, 0.05));
    expect(track.points.first.longitude, closeTo(69.2797, 0.05));
    // Marshrut janubi-gʻarbga ketadi
    expect(track.points.last.latitude, lessThan(track.points.first.latitude));
  });

  test('★ YUK TOPSHIRILGACH KUZATUV TOʻXTAYDI', () async {
    final fx = await fixture();

    for (final status in [
      OrderStatus.confirmed,
      OrderStatus.enRouteToPickup,
      OrderStatus.arrivedAtPickup,
      OrderStatus.loaded,
      OrderStatus.inTransit,
      OrderStatus.arrivedAtDelivery,
    ]) {
      await fx.driverOrders.changeStatus(fx.orderId, status);
    }

    expect(await fx.driver.sendPoints(route(2)), isTrue);
    expect(await fx.shipper.lastLocation(fx.orderId), isNotNull);

    await fx.driverOrders.changeStatus(fx.orderId, OrderStatus.delivered);

    // Yuk topshirilgan — haydovchining keyingi harakati mijozga
    // aloqador emas
    expect(await fx.shipper.lastLocation(fx.orderId), isNull);
    expect(await fx.driver.sendPoints(route(1)), isFalse);

    // Bosib oʻtilgan yoʻl esa saqlanadi — nizoda dalil
    final track = await fx.shipper.track(fx.orderId);
    expect(track.points, isNotEmpty);
  });

  test('begona buyurtma kuzatuvi ochilmaydi', () async {
    final mine = await fixture();
    final other = await fixture();

    await expectLater(
      mine.shipper.lastLocation(other.orderId),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'NOT_FOUND')),
    );
  });
}

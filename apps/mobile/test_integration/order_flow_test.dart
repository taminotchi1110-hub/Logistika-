import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/features/orders/data/orders_repository.dart';
import 'package:karvon/features/orders/domain/order.dart';

import 'support/memory_token_storage.dart';

/// Buyurtmaning 13 bosqichli yo'li — HAQIQIY backend bilan.
///
/// TEKSHIRILADI:
///   - har bosqichda server bergan `nextAllowed` mobil model orqali
///     to'g'ri o'qiladi
///   - kontakt qoidasi: telefon FAQAT `ARRIVED_AT_PICKUP` da ochiladi
///   - noto'g'ri o'tish va noto'g'ri rol rad etiladi
///   - tarix to'liq va tartibda qaytadi
///
/// Haydovchini tasdiqlash bazaga yozishni talab qiladi, shuning uchun
/// buyurtma `scripts/order-fixture.js` orqali tayyorlanadi.
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
void main() {
  /// Repo ildizi — test `apps/mobile` dan ishga tushadi.
  final repoRoot = Directory.current.path.replaceAll(r'\', '/').replaceAll(
        RegExp(r'/apps/mobile/?$'),
        '',
      );

  Future<
      ({
        String orderId,
        OrdersRepository shipper,
        OrdersRepository driver,
        String shipperPhone,
        String driverPhone,
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

    OrdersRepository client(String token) {
      final storage = MemoryTokenStorage();
      // Token to'g'ridan-to'g'ri beriladi: OTP oqimi bu testning
      // mavzusi emas va uni takrorlash faqat sekinlashtiradi
      storage.saveTokens(accessToken: token, refreshToken: token);
      return OrdersRepository(ApiClient(storage: storage));
    }

    return (
      orderId: data['orderId'] as String,
      shipper: client(data['shipperToken'] as String),
      driver: client(data['driverToken'] as String),
      shipperPhone: data['shipperPhone'] as String,
      driverPhone: data['driverPhone'] as String,
    );
  }

  test('★ KONTAKT QOIDASI: TELEFON YETIB BORGANDA OCHILADI', () async {
    final fx = await fixture();

    // --- ASSIGNED: hech narsa ochiq emas ---
    var order = await fx.driver.byId(fx.orderId);
    expect(order.status, OrderStatus.assigned);
    expect(order.visibility.counterpartyPhone, isFalse);
    expect(order.visibility.chatEnabled, isTrue, reason: 'muloqot chatdan boshlanadi');
    expect(order.visibility.emergencyRevealAvailable, isTrue);
    expect(order.counterparty.phone, contains('*'), reason: 'raqam maskalangan');
    expect(order.conversationId, isNotNull);

    // --- CONFIRMED / EN_ROUTE: hali yopiq ---
    order = await fx.driver.changeStatus(fx.orderId, OrderStatus.confirmed);
    expect(order.visibility.counterpartyPhone, isFalse);

    order = await fx.driver.changeStatus(fx.orderId, OrderStatus.enRouteToPickup);
    expect(order.visibility.counterpartyPhone, isFalse);
    expect(order.status.isTracking, isTrue, reason: 'kuzatuv shu yerdan boshlanadi');

    // --- ARRIVED_AT_PICKUP: OCHILADI ---
    order = await fx.driver.changeStatus(
      fx.orderId,
      OrderStatus.arrivedAtPickup,
      lat: 41.3111,
      lng: 69.2797,
    );

    expect(order.visibility.counterpartyPhone, isTrue);
    expect(order.visibility.pickupPhone, isTrue);
    expect(order.counterparty.phone, fx.shipperPhone);
    expect(order.counterparty.phone, isNot(contains('*')));
    // Endi favqulodda tugma kerak emas
    expect(order.visibility.emergencyRevealAvailable, isFalse);
    // Yetkazish kontakti hali yopiq — u yuk ortilgach ochiladi
    expect(order.visibility.deliveryPhone, isFalse);

    // Ikkinchi tomon ham ko'radi
    final shipperView = await fx.shipper.byId(fx.orderId);
    expect(shipperView.counterparty.phone, fx.driverPhone);

    // --- LOADED: yetkazish kontakti ochiladi ---
    order = await fx.driver.changeStatus(fx.orderId, OrderStatus.loaded);
    expect(order.visibility.deliveryPhone, isTrue);
  });

  test('★ NEXTALLOWED HAR BOSQICHDA TOʻGʻRI KELADI', () async {
    final fx = await fixture();

    var order = await fx.driver.byId(fx.orderId);
    expect(order.forwardTransitions, [OrderStatus.confirmed]);
    expect(order.cancelTransitions, isNotEmpty);

    order = await fx.driver.changeStatus(fx.orderId, OrderStatus.confirmed);
    expect(order.forwardTransitions, [OrderStatus.enRouteToPickup]);

    order = await fx.driver.changeStatus(fx.orderId, OrderStatus.enRouteToPickup);
    expect(order.forwardTransitions, [OrderStatus.arrivedAtPickup]);

    order = await fx.driver.changeStatus(fx.orderId, OrderStatus.arrivedAtPickup);
    expect(order.forwardTransitions, [OrderStatus.loaded]);

    // Yuk ortilgach haydovchi bekor qila olmaydi — faqat admin.
    // `nextAllowed` foydalanuvchi bajara oladigan qadamlar bilan
    // cheklangani uchun roʻyxat BOʻSH keladi: ilova bosib boʻlmaydigan
    // tugma chizmasligi kerak
    order = await fx.driver.changeStatus(fx.orderId, OrderStatus.loaded);
    expect(order.forwardTransitions, [OrderStatus.inTransit]);
    expect(order.cancelTransitions, isEmpty);
  });

  test('★ TOʻLIQ YOʻL: ASSIGNED → COMPLETED', () async {
    final fx = await fixture();

    const chain = [
      OrderStatus.confirmed,
      OrderStatus.enRouteToPickup,
      OrderStatus.arrivedAtPickup,
      OrderStatus.loaded,
      OrderStatus.inTransit,
      OrderStatus.arrivedAtDelivery,
      OrderStatus.delivered,
    ];

    for (final status in chain) {
      final order = await fx.driver.changeStatus(fx.orderId, status);
      expect(order.status, status);
      expect(order.statusLabel, isNotEmpty);
    }

    // Yakunlashni FAQAT mijoz qiladi
    final completed = await fx.shipper.changeStatus(fx.orderId, OrderStatus.completed);
    expect(completed.status, OrderStatus.completed);
    expect(completed.status.isActive, isFalse);
    // `CLOSED` ga faqat tizim oʻtkazadi — mijozga tugma koʻrsatilmaydi
    expect(completed.forwardTransitions, isEmpty);
  });

  test('bosqichni oʻtkazib yuborib boʻlmaydi', () async {
    final fx = await fixture();

    await expectLater(
      fx.driver.changeStatus(fx.orderId, OrderStatus.loaded),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'ORDER_INVALID_TRANSITION'),
      ),
    );
  });

  test('★ NOTOʻGʻRI ROL RAD ETILADI', () async {
    final fx = await fixture();

    // Tasdiqlashni faqat haydovchi qiladi
    await expectLater(
      fx.shipper.changeStatus(fx.orderId, OrderStatus.confirmed),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'ORDER_ACTOR_NOT_ALLOWED'),
      ),
    );
  });

  test('★ TARIX TOʻLIQ VA TARTIBDA', () async {
    final fx = await fixture();

    await fx.driver.changeStatus(fx.orderId, OrderStatus.confirmed, note: 'Tayyorman');
    await fx.driver.changeStatus(
      fx.orderId,
      OrderStatus.enRouteToPickup,
      lat: 41.31,
      lng: 69.28,
    );

    final history = await fx.shipper.history(fx.orderId);

    expect(history, hasLength(3));
    expect(history.first.status, OrderStatus.assigned);
    expect(history.last.status, OrderStatus.enRouteToPickup);
    // Tartib eskidan yangiga
    expect(history[1].at.isAfter(history[0].at) || history[1].at == history[0].at, isTrue);

    final confirmed = history.firstWhere((e) => e.status == OrderStatus.confirmed);
    expect(confirmed.note, 'Tayyorman');
    expect(confirmed.actorRole, 'DRIVER');
    expect(confirmed.fromStatus, OrderStatus.assigned);
    expect(confirmed.statusLabel, isNotEmpty);

    // Koordinata berilgan qadam
    expect(history.last.hasLocation, isTrue);
    expect(history.last.lat, closeTo(41.31, 0.01));
  });

  test('★ FAVQULODDA KONTAKT OCHISH SABAB BILAN', () async {
    final fx = await fixture();

    final before = await fx.driver.byId(fx.orderId);
    expect(before.visibility.counterpartyPhone, isFalse);

    final after = await fx.driver.revealContacts(
      fx.orderId,
      'Manzilni topa olmayapman, darvoza yopiq',
    );

    // Qoidani chetlab o'tish emas — istisno holat uchun klapan
    expect(after.visibility.counterpartyPhone, isTrue);
    expect(after.counterparty.phone, fx.shipperPhone);
  });

  test('faol va tarix roʻyxatlari ajratiladi', () async {
    final fx = await fixture();

    final active = await fx.shipper.list(active: true);
    expect(active.map((order) => order.id), contains(fx.orderId));

    final finished = await fx.shipper.list(active: false);
    expect(finished.map((order) => order.id), isNot(contains(fx.orderId)));
  });
}

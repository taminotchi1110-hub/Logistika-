import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/orders/domain/order.dart';

/// Buyurtma modeli — serverning haqiqiy javob shakli bo'yicha.
///
/// Bu JSON `GET /v1/orders/:id` dan olingan. Pul maydonlari bu yerda
/// SON bo'lib keladi (`200000000`), boshqa endpointlarda esa satr —
/// shuning uchun model ikkalasini ham qabul qilishi kerak.
void main() {
  Map<String, dynamic> json({
    String status = 'ASSIGNED',
    List<String> nextAllowed = const ['CONFIRMED', 'CANCELLED_BY_DRIVER'],
    Map<String, dynamic>? visibility,
  }) =>
      {
        'id': 'o-1',
        'publicNo': '195',
        'status': status,
        'statusLabel': 'Haydovchi tanlandi',
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
          'pickupContactName': null,
          'pickupContactPhone': null,
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
          'phone': '+998 90 *** ** 67',
          'ratingAvg': 4.8,
          'ratingCount': 12,
          'role': 'DRIVER',
        },
        'vehicle': {
          'id': 'v-1',
          'brand': 'Isuzu',
          'model': 'NPR',
          'plateNumber': '01A123BC',
        },
        'visibility': visibility ??
            {
              'pickupPhone': false,
              'deliveryPhone': false,
              'counterpartyPhone': false,
              'chatEnabled': true,
              'chatReadOnly': false,
              'emergencyRevealAvailable': true,
            },
        'conversationId': 'c-1',
        'confirmedAt': null,
        'deliveredAt': null,
        'createdAt': '2026-09-08T10:00:00.000Z',
      };

  group('model', () {
    test('server javobi toʻliq oʻqiladi', () {
      final order = Order.fromJson(json());

      expect(order.id, 'o-1');
      expect(order.publicNo, '195');
      expect(order.status, OrderStatus.assigned);
      expect(order.statusLabel, 'Haydovchi tanlandi');
      expect(order.load.title, 'Mebel');
      expect(order.counterparty.fullName, 'Anvar Karimov');
      expect(order.counterparty.initials, 'AK');
      expect(order.vehicle!.plateFormatted, '01 A 123 BC');
      expect(order.conversationId, 'c-1');
    });

    test('★ PUL SATR BOʻLIB SAQLANADI', () {
      // `double` ga oʻgirilsa katta summalarda aniqlik yoʻqoladi
      final order = Order.fromJson(json());

      expect(order.priceTiyin, '200000000');
      expect(order.commissionTiyin, '8000000');
      expect(order.driverPayoutTiyin, '192000000');
    });

    test('nomaʼlum status ilovani buzmaydi', () {
      // Server yangi status qoʻshsa eski ilova qulab tushmasligi kerak
      final order = Order.fromJson(json(status: 'SOMETHING_NEW'));
      expect(order.status, OrderStatus.assigned);
    });

    test('boʻsh javobdan ham obyekt quriladi', () {
      final order = Order.fromJson(const {});
      expect(order.id, '');
      expect(order.counterparty.fullName, 'Foydalanuvchi');
      expect(order.counterparty.initials, '?');
      expect(order.vehicle, isNull);
    });
  });

  group('oʻtishlar', () {
    test('★ TUGMALAR SERVERDAN KELADI', () {
      // Ilova state machine'ni takrorlamaydi
      final order = Order.fromJson(
        json(nextAllowed: ['CONFIRMED', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_SHIPPER']),
      );

      expect(order.forwardTransitions, [OrderStatus.confirmed]);
      expect(order.cancelTransitions, hasLength(2));
    });

    test('oxirgi holatda tugma yoʻq', () {
      final order = Order.fromJson(json(status: 'CLOSED', nextAllowed: const []));

      expect(order.forwardTransitions, isEmpty);
      expect(order.cancelTransitions, isEmpty);
    });

    test('tugma matni buyruq shaklida', () {
      // Status "Yuk ortildi", tugma esa "Yukni ortdim"
      expect(OrderStatus.loaded.label, 'Yuk ortildi');
      expect(OrderStatus.loaded.actionLabel, 'Yukni ortdim');
      expect(OrderStatus.completed.actionLabel, 'Qabul qildim');
    });
  });

  group('holat guruhlari', () {
    test('faol reyslar', () {
      expect(OrderStatus.inTransit.isActive, isTrue);
      expect(OrderStatus.delivered.isActive, isTrue, reason: 'mijoz hali tasdiqlamagan');
      expect(OrderStatus.disputed.isActive, isTrue);
      expect(OrderStatus.completed.isActive, isFalse);
      expect(OrderStatus.closed.isActive, isFalse);
      expect(OrderStatus.cancelledByDriver.isActive, isFalse);
    });

    test('★ KUZATUV CHEGARASI BACKEND BILAN BIR XIL', () {
      // TRACKING_STATUSES: EN_ROUTE_TO_PICKUP … ARRIVED_AT_DELIVERY
      expect(OrderStatus.assigned.isTracking, isFalse);
      expect(OrderStatus.confirmed.isTracking, isFalse,
          reason: 'buyurtmani olish doimiy nazorat degani emas');
      expect(OrderStatus.enRouteToPickup.isTracking, isTrue);
      expect(OrderStatus.inTransit.isTracking, isTrue);
      expect(OrderStatus.arrivedAtDelivery.isTracking, isTrue);
      expect(OrderStatus.delivered.isTracking, isFalse,
          reason: 'yuk topshirilgach kuzatuv toʻxtaydi');
    });

    test('bekor qilish guruhi', () {
      expect(OrderStatus.cancelledByShipper.isCancelled, isTrue);
      expect(OrderStatus.cancelledByDriver.isCancelled, isTrue);
      expect(OrderStatus.cancelledByAdmin.isCancelled, isTrue);
      expect(OrderStatus.disputed.isCancelled, isFalse);
      expect(OrderStatus.closed.isCancelled, isFalse);
    });

    test('vaqt chizigʻidagi tartib', () {
      expect(OrderStatus.assigned.step, 1);
      expect(OrderStatus.delivered.step, 8);
      expect(OrderStatus.closed.step, 10);
      // Bekor qilish asosiy chiziqda yoʻq
      expect(OrderStatus.cancelledByDriver.step, 0);
      expect(OrderStatus.disputed.step, 0);
    });
  });

  group('kontakt koʻrinishi', () {
    test('★ QOIDA SERVERDAN KELADI, ILOVA HISOBLAMAYDI', () {
      final closed = Order.fromJson(json());
      expect(closed.visibility.counterpartyPhone, isFalse);
      expect(closed.visibility.chatEnabled, isTrue);
      expect(closed.visibility.emergencyRevealAvailable, isTrue);

      final open = Order.fromJson(
        json(
          status: 'ARRIVED_AT_PICKUP',
          visibility: {
            'pickupPhone': true,
            'deliveryPhone': false,
            'counterpartyPhone': true,
            'chatEnabled': true,
            'chatReadOnly': false,
            'emergencyRevealAvailable': false,
          },
        ),
      );
      expect(open.visibility.counterpartyPhone, isTrue);
      expect(open.visibility.emergencyRevealAvailable, isFalse);
    });

    test('visibility boʻlmasa hamma narsa yopiq', () {
      // Eski server yoki chala javob — xavfsiz tomonga ogʻamiz
      final order = Order.fromJson({...json()}..remove('visibility'));

      expect(order.visibility.counterpartyPhone, isFalse);
      expect(order.visibility.pickupPhone, isFalse);
      expect(order.visibility.chatEnabled, isFalse);
    });
  });

  group('tarix', () {
    test('qadam oʻqiladi', () {
      final entry = OrderHistoryEntry.fromJson({
        'fromStatus': 'CONFIRMED',
        'status': 'EN_ROUTE_TO_PICKUP',
        'statusLabel': 'Haydovchi yoʻlga chiqdi',
        'actorRole': 'DRIVER',
        'actorName': 'Anvar Karimov',
        'note': 'Yoʻlga chiqdim',
        'lat': 41.31,
        'lng': 69.28,
        'at': '2026-09-08T10:05:00.000Z',
      });

      expect(entry.status, OrderStatus.enRouteToPickup);
      expect(entry.fromStatus, OrderStatus.confirmed);
      expect(entry.actorRole, 'DRIVER');
      expect(entry.hasLocation, isTrue);
    });

    test('koordinatasiz qadam', () {
      final entry = OrderHistoryEntry.fromJson({
        'status': 'ASSIGNED',
        'statusLabel': 'Haydovchi tanlandi',
        'at': '2026-09-08T10:00:00.000Z',
      });

      expect(entry.hasLocation, isFalse);
      expect(entry.fromStatus, isNull);
      expect(entry.note, isNull);
    });
  });
}

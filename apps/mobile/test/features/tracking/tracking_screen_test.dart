import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/theme/app_theme.dart';
import 'package:karvon/core/ws/socket_client.dart';
import 'package:karvon/core/ws/ws_providers.dart';
import 'package:karvon/features/orders/domain/order.dart';
import 'package:karvon/features/orders/presentation/orders_screen.dart';
import 'package:karvon/features/tracking/data/tracking_repository.dart';
import 'package:karvon/features/tracking/domain/live_location.dart';
import 'package:karvon/features/tracking/presentation/tracking_screen.dart';
import 'package:mocktail/mocktail.dart';

class _MockTrackingRepository extends Mock implements TrackingRepository {}

class _FakeSocket implements SocketClient {
  final _locations = StreamController<RealtimeLocation>.broadcast();
  final subscribed = <String>[];

  @override
  Stream<RealtimeLocation> get locations => _locations.stream;

  @override
  void subscribeOrder(String orderId) => subscribed.add(orderId);

  @override
  void unsubscribeOrder(String orderId) => subscribed.remove(orderId);

  void emit(RealtimeLocation location) => _locations.add(location);

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

/// Jonli kuzatuv ekrani.
///
/// ASOSIY QOIDA: kuzatuv faqat reys davomida ishlaydi. Ekran bu
/// holatni YASHIRMAYDI — bo'sh xarita "ishlamayapti" degan taassurot
/// qoldiradi va foydalanuvchi qo'llab-quvvatlashga murojaat qiladi.
void main() {
  late _MockTrackingRepository repository;
  late _FakeSocket socket;

  setUp(() {
    repository = _MockTrackingRepository();
    socket = _FakeSocket();

    when(() => repository.track(any())).thenAnswer(
      (_) async => const OrderTrack(points: [], pointsCount: 0),
    );
  });

  Order order(String status) => Order.fromJson({
        'id': 'o-1',
        'publicNo': '195',
        'status': status,
        'statusLabel': 'Test',
        'nextAllowed': const <String>[],
        'priceTiyin': 200000000,
        'commissionTiyin': 8000000,
        'driverPayoutTiyin': 192000000,
        'paymentMethod': 'CASH',
        'paymentStatus': 'CREATED',
        'load': {
          'id': 'l-1',
          'title': 'Mebel',
          'weightKg': 4000,
          'pickupAddress': 'Toshkent',
          'pickupLat': 41.3111,
          'pickupLng': 69.2797,
          'deliveryAddress': 'Samarqand',
          'deliveryLat': 39.6542,
          'deliveryLng': 66.9597,
        },
        'counterparty': {'id': 'u-1', 'role': 'DRIVER'},
        'visibility': const <String, dynamic>{},
        'createdAt': '2026-09-08T10:00:00.000Z',
      });

  LiveLocation location({bool isStale = false, int? eta = 42}) => LiveLocation(
        orderId: 'o-1',
        lat: 41.0,
        lng: 68.5,
        recordedAt: DateTime.now().subtract(const Duration(minutes: 12)),
        target: 'DELIVERY',
        targetLat: 39.6542,
        targetLng: 66.9597,
        distanceToTargetKm: 128.4,
        speedKmh: 72,
        headingDeg: 210,
        etaMinutes: eta,
        isStale: isStale,
      );

  Future<void> pump(
    WidgetTester tester, {
    required String status,
    LiveLocation? live,
  }) async {
    when(() => repository.lastLocation(any())).thenAnswer((_) async => live);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          trackingRepositoryProvider.overrideWithValue(repository),
          socketClientProvider.overrideWithValue(socket),
          orderProvider('o-1').overrideWith((ref) => Future.value(order(status))),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const TrackingScreen(orderId: 'o-1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('★ KUZATUV BOSHLANMAGANINI AYTADI', (tester) async {
    await pump(tester, status: 'CONFIRMED');

    expect(find.text('Kuzatuv hali boshlanmagan'), findsOneWidget);
    // NEGA ishlamayotgani tushuntiriladi
    expect(find.textContaining('maxfiylik qoidasi'), findsOneWidget);
  });

  testWidgets('★ KUZATUV TUGAGANINI AYTADI', (tester) async {
    await pump(tester, status: 'DELIVERED');

    expect(find.text('Kuzatuv yakunlandi'), findsOneWidget);
    expect(find.textContaining('tarixida saqlanadi'), findsOneWidget);
  });

  testWidgets('buyurtma xonasiga obuna boʻladi', (tester) async {
    await pump(tester, status: 'IN_TRANSIT', live: location());

    expect(socket.subscribed, contains('o-1'));
  });

  testWidgets('★ ETA VA MASOFA KOʻRSATILADI', (tester) async {
    await pump(tester, status: 'IN_TRANSIT', live: location());

    expect(find.text('Yetkazish manziliga ketyapti'), findsOneWidget);
    expect(find.text('128 km'), findsOneWidget);
    expect(find.text('42 daq'), findsOneWidget);
    expect(find.text('72 km/soat'), findsOneWidget);
  });

  testWidgets('birinchi nuqta kutilayotgani aytiladi', (tester) async {
    await pump(tester, status: 'EN_ROUTE_TO_PICKUP');

    expect(find.textContaining('Birinchi joylashuv kutilmoqda'), findsOneWidget);
  });

  testWidgets('★ ESKIRGAN MAʼLUMOT HAQIDA OGOHLANTIRADI', (tester) async {
    await pump(tester, status: 'IN_TRANSIT', live: location(isStale: true));

    // Eskirgan nuqtani jonli deb koʻrsatish "haydovchi qimirlamayapti"
    // degan notoʻgʻri xulosaga olib keladi
    expect(find.textContaining('Aloqa yoʻqolgan'), findsOneWidget);
    expect(find.textContaining('12 daqiqa'), findsOneWidget);
  });

  testWidgets('ETA nomaʼlum boʻlsa chiziqcha', (tester) async {
    await pump(tester, status: 'IN_TRANSIT', live: location(eta: null));

    expect(find.text('—'), findsOneWidget);
  });

  testWidgets('★ JONLI NUQTA KARTOCHKANI YANGILAYDI', (tester) async {
    await pump(tester, status: 'IN_TRANSIT', live: location());
    expect(find.text('128 km'), findsOneWidget);

    socket.emit(RealtimeLocation(
      orderId: 'o-1',
      lat: 40.5,
      lng: 68.0,
      recordedAt: DateTime.now(),
      target: 'DELIVERY',
      distanceToTargetKm: 95.2,
      etaMinutes: 30,
    ));
    await tester.pump();
    await tester.pump();

    expect(find.text('95 km'), findsOneWidget);
    expect(find.text('30 daq'), findsOneWidget);
  });

  testWidgets('boshqa buyurtma nuqtasi eʼtiborga olinmaydi', (tester) async {
    await pump(tester, status: 'IN_TRANSIT', live: location());

    socket.emit(RealtimeLocation(
      orderId: 'boshqa-buyurtma',
      lat: 10,
      lng: 10,
      recordedAt: DateTime.now(),
      distanceToTargetKm: 1,
    ));
    await tester.pump();
    await tester.pump();

    expect(find.text('128 km'), findsOneWidget);
  });
}

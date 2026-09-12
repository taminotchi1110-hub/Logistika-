import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/location/device_location.dart';
import 'package:karvon/core/ws/socket_client.dart';
import 'package:karvon/features/tracking/data/location_sender.dart';
import 'package:karvon/features/tracking/data/tracking_repository.dart';
import 'package:mocktail/mocktail.dart';

class _MockTrackingRepository extends Mock implements TrackingRepository {}

/// Soxta socket: ulanish holatini test boshqaradi.
class _FakeSocket implements SocketClient {
  final _connection = StreamController<bool>.broadcast();
  final sentLive = <({double lat, double lng})>[];

  bool connected = true;

  @override
  bool get isConnected => connected;

  @override
  Stream<bool> get connectionState => _connection.stream;

  void goOffline() {
    connected = false;
    _connection.add(false);
  }

  void goOnline() {
    connected = true;
    _connection.add(true);
  }

  @override
  void sendLocation({required double lat, required double lng, double? speedKmh}) {
    sentLive.add((lat: lat, lng: lng));
  }

  Future<void> close() => _connection.close();

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

/// Haydovchining joylashuv yuboruvchisi.
///
/// ALOQA UZILISHI — NORMAL HOLAT: haydovchi tunnelga kiradi, tog'
/// yo'lida tarmoq yo'qoladi. Nuqtalar yo'qolmasligi va aloqa
/// tiklanganda TO'PLAM bilan ketishi kerak.
void main() {
  late _MockTrackingRepository repository;
  late _FakeSocket socket;

  const position = DeviceLocation(lat: 41.3111, lng: 69.2797, accuracyM: 8);

  /// "Faqat darhol yuborilgan nuqta" tekshiruvlari uchun: davriy yuborish
  /// test davomida umuman ishlamaydi. 20 ms interval bilan bu testlar
  /// band mashinada (butun to'plam parallel ishlaganda) tasodifan
  /// yiqilardi — kutish 5 ms bo'lsa ham navbatdagi tik ulgurardi.
  const neverTicks = Duration(hours: 1);

  setUp(() {
    repository = _MockTrackingRepository();
    socket = _FakeSocket();
    // `true` — server marshrutni yozdi (faol reys bor)
    when(() => repository.sendPoints(any())).thenAnswer((_) async => true);
  });

  tearDown(() => socket.close());

  DriverLocationSender build({
    LocationResolver? resolver,
    Duration interval = const Duration(milliseconds: 20),
  }) {
    return DriverLocationSender(
      socket: socket,
      repository: repository,
      resolver: resolver ?? () async => position,
      interval: interval,
    );
  }

  test('★ BIRINCHI NUQTA DARHOL YUBORILADI', () async {
    final sender = build(interval: neverTicks);
    sender.start('o-1');

    // Mijoz xaritani intervalni kutmasdan koʻrishi kerak
    await Future<void>.delayed(const Duration(milliseconds: 5));

    expect(socket.sentLive, hasLength(1));
    expect(socket.sentLive.first.lat, 41.3111);
    sender.stop();
  });

  test('muntazam yuboriladi', () async {
    final sender = build();
    sender.start('o-1');

    await Future<void>.delayed(const Duration(milliseconds: 75));
    sender.stop();

    expect(socket.sentLive.length, greaterThanOrEqualTo(3));
  });

  test('★ ALOQA YOʻQ — NUQTALAR BUFERGA YIGʻILADI', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1');

    await Future<void>.delayed(const Duration(milliseconds: 75));

    expect(socket.sentLive, isEmpty);
    expect(sender.bufferedCount, greaterThanOrEqualTo(3));
    // Hech narsa yoʻqolmadi
    verifyNever(() => repository.sendPoints(any()));

    sender.stop();
  });

  test('★ ALOQA TIKLANGANDA BUFER TOʻPLAM BILAN KETADI', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1');

    await Future<void>.delayed(const Duration(milliseconds: 75));
    final buffered = sender.bufferedCount;
    expect(buffered, greaterThanOrEqualTo(3));

    socket.goOnline();
    await Future<void>.delayed(const Duration(milliseconds: 30));

    // BITTA soʻrov, har bir nuqta uchun alohida emas: tunneldan
    // chiqqan haydovchida oʻnlab soʻrov hosil boʻlmasligi kerak
    final captured = verify(() => repository.sendPoints(captureAny())).captured;
    expect(captured, hasLength(1));
    expect((captured.first as List).length, greaterThanOrEqualTo(buffered));

    sender.stop();
  });

  test('★ YUBORILMASA NUQTALAR BUFERDA QOLADI', () async {
    when(() => repository.sendPoints(any())).thenThrow(Exception('tarmoq'));

    socket.connected = false;
    final sender = build();
    sender.start('o-1');
    await Future<void>.delayed(const Duration(milliseconds: 50));

    final before = sender.bufferedCount;
    socket.goOnline();
    await Future<void>.delayed(const Duration(milliseconds: 30));

    // Keyingi urinishda qayta yuboriladi
    expect(sender.bufferedCount, greaterThanOrEqualTo(before));
    sender.stop();
  });

  test('★ BUFER CHEKSIZ OʻSMAYDI', () async {
    socket.connected = false;
    // Juda tez interval — chegaraga tez yetamiz
    final sender = build(interval: const Duration(milliseconds: 1));
    sender.start('o-1');

    await Future<void>.delayed(const Duration(milliseconds: 900));
    sender.stop();

    // 500 nuqta ≈ 83 daqiqa; undan uzoq uzilishda eski nuqtalarning
    // qiymati ham kam
    expect(sender.bufferedCount, lessThanOrEqualTo(500));
  });

  test('joylashuv aniqlanmasa jimgina oʻtkaziladi', () async {
    final sender = build(resolver: () async => null);
    sender.start('o-1');

    await Future<void>.delayed(const Duration(milliseconds: 60));

    // GPS oʻchiq boʻlgani reysni toʻxtatib qoʻymasligi kerak
    expect(socket.sentLive, isEmpty);
    expect(sender.bufferedCount, 0);
    expect(sender.isRunning, isTrue);

    sender.stop();
  });

  test('toʻxtatilganda bufer tozalanadi', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1');
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(sender.bufferedCount, greaterThan(0));
    sender.stop();

    expect(sender.isRunning, isFalse);
    expect(sender.bufferedCount, 0);
    expect(sender.orderId, isNull);
  });

  test('★ BOSHQA REYSGA OʻTGANDA ESKI NUQTALAR ARALASHMAYDI', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(sender.bufferedCount, greaterThan(0));

    sender.start('o-2');

    expect(sender.orderId, 'o-2');
    // Oldingi reysning nuqtalari yangisiga yozilmasligi kerak
    expect(sender.bufferedCount, lessThanOrEqualTo(1));

    sender.stop();
  });

  test('bir xil reysga qayta start — qayta ishga tushirmaydi', () async {
    final sender = build(interval: neverTicks);
    sender.start('o-1');
    await Future<void>.delayed(const Duration(milliseconds: 5));
    final afterFirst = socket.sentLive.length;

    sender.start('o-1');
    await Future<void>.delayed(const Duration(milliseconds: 5));

    // Darhol yuborish takrorlanmaydi
    expect(socket.sentLive.length, afterFirst);
    sender.stop();
  });
}

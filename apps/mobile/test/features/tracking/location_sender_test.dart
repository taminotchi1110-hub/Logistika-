import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/location/device_location.dart';
import 'package:karvon/core/location/trip_location.dart';
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

/// Soxta joylashuv oqimi — nuqtalarni test oʻzi beradi.
///
/// TAYMER OʻRNIGA OQIM: testlar ham aniq boʻldi. Ilgari ular haqiqiy
/// intervalni kutardi va band mashinada tasodifan yiqilardi.
class _FakeLocationStream {
  StreamController<DeviceLocation>? _controller;
  TripNotificationText? notification;
  Duration? interval;
  var subscriptions = 0;

  Stream<DeviceLocation> call({
    required Duration interval,
    required TripNotificationText notification,
  }) {
    this.interval = interval;
    this.notification = notification;
    subscriptions++;
    _controller = StreamController<DeviceLocation>();
    return _controller!.stream;
  }

  void emit(DeviceLocation position) => _controller?.add(position);
  void emitError(Object error) => _controller?.addError(error);
}

/// Haydovchining joylashuv yuboruvchisi.
///
/// ALOQA UZILISHI — NORMAL HOLAT: haydovchi tunnelga kiradi, togʻ
/// yoʻlida tarmoq yoʻqoladi. Nuqtalar yoʻqolmasligi va aloqa
/// tiklanganda TOʻPLAM bilan ketishi kerak.
void main() {
  late _MockTrackingRepository repository;
  late _FakeSocket socket;
  late _FakeLocationStream locations;

  const position = DeviceLocation(lat: 41.3111, lng: 69.2797, accuracyM: 8);
  const notification = TripNotificationText(title: 'Reys kuzatuvda', body: 'Mijoz koʻradi');

  /// Oqim hodisalari asinxron — bitta sikl kutiladi.
  Future<void> settle() => Future<void>.delayed(Duration.zero);

  setUp(() {
    repository = _MockTrackingRepository();
    socket = _FakeSocket();
    locations = _FakeLocationStream();
    // `true` — server marshrutni yozdi (faol reys bor)
    when(() => repository.sendPoints(any())).thenAnswer((_) async => true);
  });

  tearDown(() => socket.close());

  DriverLocationSender build({Duration interval = const Duration(seconds: 10)}) {
    return DriverLocationSender(
      socket: socket,
      repository: repository,
      stream: locations.call,
      interval: interval,
    );
  }

  test('★ NUQTA KELISHI BILAN YUBORILADI', () async {
    final sender = build();
    sender.start('o-1', notification: notification);

    locations.emit(position);
    await settle();

    expect(socket.sentLive, hasLength(1));
    expect(socket.sentLive.first.lat, 41.3111);
    sender.stop();
  });

  test('★ FON XIZMATI UCHUN BILDIRISHNOMA VA INTERVAL OQIMGA BERILADI', () async {
    // Busiz Android fon xizmati ishga tushmaydi va ekran qulflanganda
    // kuzatuv toʻxtaydi
    final sender = build(interval: const Duration(seconds: 7));
    sender.start('o-1', notification: notification);

    expect(locations.notification?.title, 'Reys kuzatuvda');
    expect(locations.interval, const Duration(seconds: 7));
    sender.stop();
  });

  test('har bir nuqta yuboriladi', () async {
    final sender = build();
    sender.start('o-1', notification: notification);

    for (var i = 0; i < 3; i++) {
      locations.emit(position);
    }
    await settle();
    sender.stop();

    expect(socket.sentLive, hasLength(3));
  });

  test('★ ALOQA YOʻQ — NUQTALAR BUFERGA YIGʻILADI', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1', notification: notification);

    for (var i = 0; i < 3; i++) {
      locations.emit(position);
    }
    await settle();

    expect(socket.sentLive, isEmpty);
    expect(sender.bufferedCount, 3);
    // Hech narsa yoʻqolmadi
    verifyNever(() => repository.sendPoints(any()));

    sender.stop();
  });

  test('★ ALOQA TIKLANGANDA BUFER TOʻPLAM BILAN KETADI', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1', notification: notification);

    for (var i = 0; i < 3; i++) {
      locations.emit(position);
    }
    await settle();
    expect(sender.bufferedCount, 3);

    socket.goOnline();
    await settle();
    await settle();

    // BITTA soʻrov, har bir nuqta uchun alohida emas: tunneldan
    // chiqqan haydovchida oʻnlab soʻrov hosil boʻlmasligi kerak
    final captured = verify(() => repository.sendPoints(captureAny())).captured;
    expect(captured, hasLength(1));
    expect((captured.first as List).length, 3);

    sender.stop();
  });

  test('★ YUBORILMASA NUQTALAR BUFERDA QOLADI', () async {
    when(() => repository.sendPoints(any())).thenThrow(Exception('tarmoq'));

    socket.connected = false;
    final sender = build();
    sender.start('o-1', notification: notification);
    locations.emit(position);
    locations.emit(position);
    await settle();

    socket.goOnline();
    await settle();
    await settle();

    // Keyingi urinishda qayta yuboriladi
    expect(sender.bufferedCount, 2);
    sender.stop();
  });

  test('★ BUFER CHEKSIZ OʻSMAYDI', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1', notification: notification);

    for (var i = 0; i < 600; i++) {
      locations.emit(position);
    }
    await settle();
    sender.stop();

    // 500 nuqta ≈ 83 daqiqa; undan uzoq uzilishda eski nuqtalarning
    // qiymati ham kam
    expect(sender.bufferedCount, lessThanOrEqualTo(500));
  });

  test('★ GPS XATOSI KUZATUVNI TOʻXTATMAYDI', () async {
    final sender = build();
    sender.start('o-1', notification: notification);

    // Signal yoʻqoldi yoki servis oʻchdi — oqim keyin tiklanishi mumkin
    locations.emitError(Exception('joylashuv yoʻq'));
    await settle();

    expect(sender.isRunning, isTrue);

    locations.emit(position);
    await settle();
    expect(socket.sentLive, hasLength(1));

    sender.stop();
  });

  test('toʻxtatilganda bufer tozalanadi', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1', notification: notification);
    locations.emit(position);
    await settle();

    expect(sender.bufferedCount, greaterThan(0));
    sender.stop();

    expect(sender.isRunning, isFalse);
    expect(sender.bufferedCount, 0);
    expect(sender.orderId, isNull);
  });

  test('★ BOSHQA REYSGA OʻTGANDA ESKI NUQTALAR ARALASHMAYDI', () async {
    socket.connected = false;
    final sender = build();
    sender.start('o-1', notification: notification);
    locations.emit(position);
    await settle();
    expect(sender.bufferedCount, greaterThan(0));

    sender.start('o-2', notification: notification);

    expect(sender.orderId, 'o-2');
    // Oldingi reysning nuqtalari yangisiga yozilmasligi kerak
    expect(sender.bufferedCount, 0);

    sender.stop();
  });

  test('bir xil reysga qayta start — qayta ishga tushirmaydi', () async {
    final sender = build();
    sender.start('o-1', notification: notification);
    sender.start('o-1', notification: notification);

    // Oqimga qayta obuna boʻlinmaydi: fon xizmati ham qayta ishga tushmaydi
    expect(locations.subscriptions, 1);
    sender.stop();
  });
}

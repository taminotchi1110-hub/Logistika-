import 'dart:async';

import '../../../core/config/app_config.dart';
import '../../../core/location/device_location.dart';
import '../../../core/location/trip_location.dart';
import '../../../core/ws/socket_client.dart';
import 'tracking_repository.dart';

/// Haydovchining joylashuvini muntazam yuboradi.
///
/// FAQAT FAOL REYS DAVOMIDA ISHLAYDI. Bu maxfiylik qoidasi: haydovchi
/// ilovani ochib qo'ygani uni doimiy nazoratga qo'ymaydi. Backend ham
/// shu qoidani mustaqil tekshiradi (`TRACKING_NOT_ACTIVE`).
///
/// EKRAN QULFLANGANDA HAM ISHLAYDI: nuqtalar platformaning fon
/// xizmatidan keladi (`trip_location.dart`). Ilgari bu yerda oddiy
/// `Timer.periodic` turgan edi va u ilova fonga o'tgach to'xtardi —
/// mijoz haydovchini xaritada "muzlagan" holda ko'rardi, aslida reys
/// davom etayotgan bo'lardi.
///
/// ALOQA UZILISHI — NORMAL HOLAT: haydovchi tunnelga kiradi, tog'
/// yo'lida tarmoq yo'qoladi. Nuqtalar buferga yig'iladi va aloqa
/// tiklanganda TO'PLAM bilan yuboriladi. Har birini alohida yuborish
/// tunneldan chiqqan haydovchida o'nlab so'rov hosil qilardi.
class DriverLocationSender {
  DriverLocationSender({
    required SocketClient socket,
    required TrackingRepository repository,
    TripLocationStream? stream,
    Duration? interval,
  }) : _socket = socket,
       _repository = repository,
       _stream = stream ?? deviceTripLocationStream,
       _interval =
           interval ?? const Duration(seconds: AppConfig.trackingIntervalSeconds);

  final SocketClient _socket;
  final TrackingRepository _repository;
  final TripLocationStream _stream;
  final Duration _interval;

  /// Yuborilmagan nuqtalar.
  ///
  /// CHEGARA BOR: uzoq aloqasizlikda bufer cheksiz o'smasligi kerak —
  /// eng eskisi tashlanadi. 500 nuqta ≈ 83 daqiqa; undan uzoq
  /// uzilishda eski nuqtalarning qiymati ham kam.
  static const _maxBuffered = 500;
  final _buffer = <Map<String, dynamic>>[];

  StreamSubscription<DeviceLocation>? _locationSubscription;
  StreamSubscription<bool>? _connectionSubscription;
  String? _orderId;
  bool _isFlushing = false;

  bool get isRunning => _locationSubscription != null;
  String? get orderId => _orderId;
  int get bufferedCount => _buffer.length;

  /// Kuzatuvni boshlaydi. Boshqa reys uchun ishlayotgan bo'lsa,
  /// avval to'xtaydi.
  ///
  /// `notification` — Android fon xizmatining doimiy bildirishnomasi
  /// (tizim talabi). Matn foydalanuvchi tilida bo'lishi uchun chaqiruvchi
  /// tomondan beriladi.
  void start(String orderId, {required TripNotificationText notification}) {
    if (_orderId == orderId && isRunning) return;

    stop();
    _orderId = orderId;

    _locationSubscription = _stream(interval: _interval, notification: notification).listen(
      _onPosition,
      // GPS xatosi (signal yo'q, ruxsat olindi-yu servis o'chdi) reysni
      // to'xtatmaydi: oqim tiklanishi mumkin, kuzatuv esa qo'shimcha
      onError: (Object _) {},
      cancelOnError: false,
    );

    // Aloqa tiklanganda buferni bo'shatamiz
    _connectionSubscription = _socket.connectionState.listen((isUp) {
      if (isUp) unawaited(_flush());
    });
  }

  void stop() {
    _locationSubscription?.cancel();
    _locationSubscription = null;
    _connectionSubscription?.cancel();
    _connectionSubscription = null;
    _orderId = null;
    _buffer.clear();
  }

  void _onPosition(DeviceLocation position) {
    if (_orderId == null) return;

    final point = <String, dynamic>{
      'lat': position.lat,
      'lng': position.lng,
      if (position.accuracyM != null) 'accuracyM': position.accuracyM,
      'recordedAt': DateTime.now().toUtc().toIso8601String(),
    };

    if (_socket.isConnected) {
      _socket.sendLocation(lat: position.lat, lng: position.lng);
      // Bufer bo'sh bo'lmasa — aloqa endi tiklandi, uni ham yuboramiz
      if (_buffer.isNotEmpty) unawaited(_flush());
      return;
    }

    _buffer.add(point);
    if (_buffer.length > _maxBuffered) _buffer.removeAt(0);
  }

  /// Buferni REST orqali to'plam bilan yuboradi.
  Future<void> _flush() async {
    if (_isFlushing || _buffer.isEmpty) return;
    _isFlushing = true;

    // Nusxa olamiz: yuborish davomida yangi nuqtalar qo'shilishi mumkin
    final pending = List<Map<String, dynamic>>.from(_buffer);

    try {
      await _repository.sendPoints(pending);
      _buffer.removeRange(0, pending.length.clamp(0, _buffer.length));
    } on Object {
      // Yuborilmadi — nuqtalar buferda qoladi va keyingi urinishda
      // qayta yuboriladi
    } finally {
      _isFlushing = false;
    }
  }
}

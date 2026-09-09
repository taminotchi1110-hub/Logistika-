import 'package:latlong2/latlong.dart';

/// Haydovchining jonli joylashuvi.
///
/// Faqat reys davomida mavjud: `EN_ROUTE_TO_PICKUP` dan
/// `ARRIVED_AT_DELIVERY` gacha. Bu maxfiylik qoidasi — buyurtmani
/// olish haydovchini doimiy nazoratga qo'ymaydi.
class LiveLocation {
  const LiveLocation({
    required this.orderId,
    required this.lat,
    required this.lng,
    required this.recordedAt,
    required this.target,
    required this.targetLat,
    required this.targetLng,
    required this.distanceToTargetKm,
    this.speedKmh,
    this.headingDeg,
    this.etaMinutes,
    this.isStale = false,
  });

  factory LiveLocation.fromJson(Map<String, dynamic> json) => LiveLocation(
        orderId: json['orderId'] as String? ?? '',
        lat: (json['lat'] as num?)?.toDouble() ?? 0,
        lng: (json['lng'] as num?)?.toDouble() ?? 0,
        recordedAt: DateTime.tryParse('${json['recordedAt']}') ?? DateTime.now(),
        target: json['target'] as String? ?? 'PICKUP',
        targetLat: (json['targetLat'] as num?)?.toDouble() ?? 0,
        targetLng: (json['targetLng'] as num?)?.toDouble() ?? 0,
        distanceToTargetKm: (json['distanceToTargetKm'] as num?)?.toDouble() ?? 0,
        speedKmh: (json['speedKmh'] as num?)?.toDouble(),
        headingDeg: (json['headingDeg'] as num?)?.toInt(),
        etaMinutes: (json['etaMinutes'] as num?)?.toInt(),
        isStale: json['isStale'] as bool? ?? false,
      );

  final String orderId;
  final double lat;
  final double lng;
  final DateTime recordedAt;

  /// `PICKUP` yoki `DELIVERY` — hozir qaysi nuqtaga ketyapti.
  final String target;
  final double targetLat;
  final double targetLng;
  final double distanceToTargetKm;

  final double? speedKmh;
  final int? headingDeg;
  final int? etaMinutes;

  /// 3 daqiqadan eski maʼlumot — haydovchi aloqadan chiqqan
  /// (tunnel, batareya, tarmoq yo'q).
  ///
  /// FOYDALANUVCHIGA AYTILADI: eskirgan nuqtani jonli deb ko'rsatish
  /// yolg'on bo'ladi va "haydovchi qimirlamayapti" degan noto'g'ri
  /// xulosaga olib keladi.
  final bool isStale;

  LatLng get position => LatLng(lat, lng);
  LatLng get targetPosition => LatLng(targetLat, targetLng);

  bool get isHeadingToPickup => target == 'PICKUP';

  /// Maʼlumot qanchalik eski.
  Duration get age => DateTime.now().difference(recordedAt.toLocal());
}

/// Buyurtmaning bosib o'tilgan yo'li.
class OrderTrack {
  const OrderTrack({required this.points, required this.pointsCount});

  factory OrderTrack.fromJson(Map<String, dynamic> json, List<LatLng> points) =>
      OrderTrack(
        points: points,
        pointsCount: (json['points'] as num?)?.toInt() ?? points.length,
      );

  final List<LatLng> points;
  final int pointsCount;

  bool get isEmpty => points.length < 2;
}

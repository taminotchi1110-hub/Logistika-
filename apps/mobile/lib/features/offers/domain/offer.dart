/// Taklif holati.
enum OfferStatus {
  pending,
  accepted,
  rejected,
  withdrawn,
  expired;

  static OfferStatus fromApi(String? value) => switch (value) {
        'PENDING' => OfferStatus.pending,
        'ACCEPTED' => OfferStatus.accepted,
        'REJECTED' => OfferStatus.rejected,
        'WITHDRAWN' => OfferStatus.withdrawn,
        'EXPIRED' => OfferStatus.expired,
        _ => OfferStatus.pending,
      };

  String get label => switch (this) {
        OfferStatus.pending => 'Kutilmoqda',
        OfferStatus.accepted => 'Qabul qilindi',
        OfferStatus.rejected => 'Rad etildi',
        OfferStatus.withdrawn => 'Qaytarib olindi',
        OfferStatus.expired => 'Muddati tugadi',
      };

  bool get isActive => this == OfferStatus.pending;
}

class Offer {
  const Offer({
    required this.id,
    required this.loadId,
    required this.driverId,
    required this.driverName,
    required this.offeredPriceTiyin,
    required this.status,
    required this.expiresAt,
    required this.createdAt,
    this.driverRatingAvg = 0,
    this.driverRatingCount = 0,
    this.driverCompletedOrders = 0,
    this.message,
    this.etaToPickupMin,
    this.vehicleTitle,
    this.vehiclePlate,
    this.vehicleCapacityKg,
  });

  factory Offer.fromJson(Map<String, dynamic> json) {
    final vehicle = json['vehicle'] as Map<String, dynamic>?;

    return Offer(
      id: json['id'] as String,
      loadId: json['loadId'] as String? ?? '',
      driverId: json['driverId'] as String? ?? '',
      driverName: json['driverName'] as String? ?? '',
      driverRatingAvg: double.tryParse('${json['driverRatingAvg'] ?? 0}') ?? 0,
      driverRatingCount: (json['driverRatingCount'] as num?)?.toInt() ?? 0,
      driverCompletedOrders: (json['driverCompletedOrders'] as num?)?.toInt() ?? 0,
      offeredPriceTiyin: json['offeredPriceTiyin']?.toString() ?? '0',
      message: json['message'] as String?,
      status: OfferStatus.fromApi(json['status'] as String?),
      etaToPickupMin: (json['etaToPickupMin'] as num?)?.toInt(),
      expiresAt: DateTime.tryParse('${json['expiresAt']}') ?? DateTime.now(),
      createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
      vehicleTitle: vehicle == null ? null : '${vehicle['brand']} ${vehicle['model']}',
      vehiclePlate: vehicle?['plateNumber'] as String?,
      vehicleCapacityKg: (vehicle?['capacityKg'] as num?)?.toInt(),
    );
  }

  final String id;
  final String loadId;
  final String driverId;
  final String driverName;
  final double driverRatingAvg;
  final int driverRatingCount;
  final int driverCompletedOrders;
  final String offeredPriceTiyin;
  final String? message;
  final OfferStatus status;
  final int? etaToPickupMin;
  final DateTime expiresAt;
  final DateTime createdAt;
  final String? vehicleTitle;
  final String? vehiclePlate;
  final int? vehicleCapacityKg;

  bool get hasRating => driverRatingCount > 0;

  /// Muddati tugashiga qancha qoldi. Manfiy — tugagan.
  Duration get timeLeft => expiresAt.difference(DateTime.now());
  bool get isExpired => timeLeft.isNegative;
}

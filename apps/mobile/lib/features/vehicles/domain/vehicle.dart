enum VerificationStatus {
  notSubmitted,
  pending,
  verified,
  rejected;

  static VerificationStatus fromApi(String? value) => switch (value) {
        'NOT_SUBMITTED' => VerificationStatus.notSubmitted,
        'PENDING' => VerificationStatus.pending,
        'VERIFIED' => VerificationStatus.verified,
        'REJECTED' => VerificationStatus.rejected,
        _ => VerificationStatus.notSubmitted,
      };

  bool get isVerified => this == VerificationStatus.verified;
}

class Vehicle {
  const Vehicle({
    required this.id,
    required this.brand,
    required this.model,
    required this.plateNumber,
    required this.plateFormatted,
    required this.capacityKg,
    required this.verificationStatus,
    this.volumeM3,
    this.vehicleTypeName,
    this.bodyTypeName,
    this.trailerCapacityKg,
    this.isActive = true,
    this.isPrimary = false,
    this.rejectionReason,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) {
    return Vehicle(
      id: json['id'] as String,
      brand: json['brand'] as String? ?? '',
      model: json['model'] as String? ?? '',
      plateNumber: json['plateNumber'] as String? ?? '',
      plateFormatted: json['plateFormatted'] as String? ?? json['plateNumber'] as String? ?? '',
      capacityKg: (json['capacityKg'] as num?)?.toInt() ?? 0,
      volumeM3: (json['volumeM3'] as num?)?.toDouble(),
      vehicleTypeName: json['vehicleTypeName'] as String?,
      bodyTypeName: json['bodyTypeName'] as String?,
      trailerCapacityKg: (json['trailerCapacityKg'] as num?)?.toInt(),
      verificationStatus: VerificationStatus.fromApi(json['verificationStatus'] as String?),
      isActive: json['isActive'] as bool? ?? true,
      isPrimary: json['isPrimary'] as bool? ?? false,
      rejectionReason: json['rejectionReason'] as String?,
    );
  }

  final String id;
  final String brand;
  final String model;
  final String plateNumber;

  /// Koʻrsatish uchun: `01 A 123 BC`.
  final String plateFormatted;

  final int capacityKg;
  final double? volumeM3;
  final String? vehicleTypeName;
  final String? bodyTypeName;
  final int? trailerCapacityKg;
  final VerificationStatus verificationStatus;
  final bool isActive;
  final bool isPrimary;
  final String? rejectionReason;

  String get title => '$brand $model';

  /// Tirkama bilan umumiy quvvat — taklif yuborishda shu tekshiriladi.
  int get totalCapacityKg => capacityKg + (trailerCapacityKg ?? 0);

  /// Taklif yuborish uchun yaroqlimi.
  bool get canSendOffers => verificationStatus.isVerified && isActive;

  /// Shu yukni koʻtara oladimi.
  bool fits(int weightKg) => totalCapacityKg >= weightKg;
}

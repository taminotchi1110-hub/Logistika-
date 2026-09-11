import '../../vehicles/domain/vehicle.dart';

/// Hujjat turi.
///
/// Ro'yxat backend'dagi `document_type` bilan mos. Ilova faqat
/// haydovchi o'zi yuklaydigan turlarni ko'rsatadi: qolganlarini
/// (POD, WAYBILL, CONTRACT) tizim buyurtma davomida o'zi yaratadi.
enum DocumentType {
  passport,
  idCard,
  driverLicense,
  vehicleReg,
  insurance,
  other;

  static DocumentType fromApi(String? value) => switch (value) {
        'PASSPORT' => DocumentType.passport,
        'ID_CARD' => DocumentType.idCard,
        'DRIVER_LICENSE' => DocumentType.driverLicense,
        'VEHICLE_REG' => DocumentType.vehicleReg,
        'INSURANCE' => DocumentType.insurance,
        _ => DocumentType.other,
      };

  String get api => switch (this) {
        DocumentType.passport => 'PASSPORT',
        DocumentType.idCard => 'ID_CARD',
        DocumentType.driverLicense => 'DRIVER_LICENSE',
        DocumentType.vehicleReg => 'VEHICLE_REG',
        DocumentType.insurance => 'INSURANCE',
        DocumentType.other => 'OTHER',
      };

  /// Hujjat kimga tegishli — backend `ALLOWED_TYPES_BY_OWNER` bilan mos.
  ///
  /// Noto'g'ri egalik bilan yuborilgan hujjat serverda rad etiladi,
  /// shuning uchun tanlov ekranda ham to'g'ri guruhlanadi.
  String get ownerType => switch (this) {
        DocumentType.passport || DocumentType.idCard => 'USER',
        DocumentType.driverLicense => 'DRIVER',
        DocumentType.vehicleReg || DocumentType.insurance => 'VEHICLE',
        DocumentType.other => 'USER',
      };

  bool get isVehicleDocument => ownerType == 'VEHICLE';

  /// Ikki tomoni bo'ladigan hujjatlar.
  bool get hasTwoSides =>
      this == DocumentType.passport ||
      this == DocumentType.idCard ||
      this == DocumentType.driverLicense;
}

/// Yuklangan hujjat.
class UserDocument {
  const UserDocument({
    required this.id,
    required this.type,
    required this.ownerType,
    required this.ownerId,
    required this.verificationStatus,
    required this.url,
    required this.createdAt,
    this.fileName,
    this.pageSide,
    this.rejectionReason,
    this.expiresAt,
  });

  factory UserDocument.fromJson(Map<String, dynamic> json) => UserDocument(
        id: json['id'] as String? ?? '',
        type: DocumentType.fromApi(json['type'] as String?),
        ownerType: json['ownerType'] as String? ?? 'USER',
        ownerId: json['ownerId'] as String? ?? '',
        verificationStatus:
            VerificationStatus.fromApi(json['verificationStatus'] as String?),
        // Qisqa muddatli havola — javob berilayotgan paytda hosil qilinadi
        url: json['url'] as String? ?? '',
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
        fileName: json['fileName'] as String?,
        pageSide: json['pageSide'] as String?,
        rejectionReason: json['rejectionReason'] as String?,
        expiresAt: DateTime.tryParse('${json['expiresAt']}'),
      );

  final String id;
  final DocumentType type;
  final String ownerType;
  final String ownerId;
  final VerificationStatus verificationStatus;

  /// Qisqa muddatli ko'rish havolasi — saqlab qo'yish mumkin emas.
  final String url;
  final DateTime createdAt;
  final String? fileName;

  /// `FRONT` yoki `BACK`.
  final String? pageSide;
  final String? rejectionReason;
  final DateTime? expiresAt;

  bool get isRejected => verificationStatus == VerificationStatus.rejected;

  /// Amal qilish muddati tugagan yoki tugayotgan.
  ///
  /// 30 kun oldin ogohlantiriladi: yangi guvohnoma olish vaqt talab
  /// qiladi va reys o'rtasida muddati tugashi mumkin emas.
  bool get isExpiringSoon {
    final until = expiresAt;
    if (until == null) return false;
    return until.difference(DateTime.now()).inDays <= 30;
  }

  bool get isExpired =>
      expiresAt != null && expiresAt!.isBefore(DateTime.now());
}

/// Yuklash uchun vaqtinchalik havola.
class PresignedUpload {
  const PresignedUpload({
    required this.uploadUrl,
    required this.fileKey,
    required this.maxBytes,
  });

  factory PresignedUpload.fromJson(Map<String, dynamic> json) => PresignedUpload(
        uploadUrl: json['uploadUrl'] as String? ?? '',
        fileKey: json['fileKey'] as String? ?? '',
        maxBytes: (json['maxBytes'] as num?)?.toInt() ?? 0,
      );

  /// Faylni shu manzilga **PUT** qilish kerak.
  final String uploadUrl;

  /// Yuklangach shu kalit hujjat yaratishga yuboriladi.
  final String fileKey;
  final int maxBytes;
}

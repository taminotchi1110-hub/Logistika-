import '../../vehicles/domain/vehicle.dart';

/// Haydovchining taklif yuborishga tayyorligi.
///
/// NEGA SERVERDAN KELADI: "nima yetishmayapti" savoliga javob bitta
/// joyda hisoblanishi kerak. Mijoz tomonida takrorlansa, qoida
/// o'zgarganda ilova serverdan orqada qoladi va foydalanuvchi
/// "hammasi tayyor" deb ko'rsatilgan holda taklif yubora olmaydi.
class DriverReadiness {
  const DriverReadiness({
    required this.profileComplete,
    required this.hasIdentity,
    required this.hasLicense,
    required this.hasVerifiedVehicle,
    required this.hasRoutes,
    required this.verificationStatus,
    required this.canSendOffers,
    required this.missingSteps,
  });

  factory DriverReadiness.fromJson(Map<String, dynamic> json) => DriverReadiness(
        profileComplete: json['profileComplete'] as bool? ?? false,
        hasIdentity: json['hasIdentity'] as bool? ?? false,
        hasLicense: json['hasLicense'] as bool? ?? false,
        hasVerifiedVehicle: json['hasVerifiedVehicle'] as bool? ?? false,
        hasRoutes: json['hasRoutes'] as bool? ?? false,
        verificationStatus:
            VerificationStatus.fromApi(json['verificationStatus'] as String?),
        canSendOffers: json['canSendOffers'] as bool? ?? false,
        missingSteps: (json['missingSteps'] as List<dynamic>? ?? const [])
            .map((item) => ReadinessStep.fromApi('$item'))
            .toList(),
      );

  final bool profileComplete;
  final bool hasIdentity;
  final bool hasLicense;
  final bool hasVerifiedVehicle;
  final bool hasRoutes;
  final VerificationStatus verificationStatus;

  /// Taklif yuborish mumkinmi — yagona muhim natija.
  final bool canSendOffers;

  /// Nima yetishmayapti.
  final List<ReadinessStep> missingSteps;

  /// Verifikatsiyaga yuborish mumkinmi.
  ///
  /// Hujjatlar va transport joyida bo'lsa, lekin hali yuborilmagan
  /// bo'lsa — tugma ko'rsatiladi.
  bool get canSubmit =>
      !canSendOffers &&
      verificationStatus == VerificationStatus.notSubmitted &&
      hasIdentity &&
      hasLicense;

  /// Nechta qadam bajarilgan (5 tadan).
  int get completedCount => [
        profileComplete,
        hasIdentity,
        hasLicense,
        hasVerifiedVehicle,
        hasRoutes,
      ].where((done) => done).length;

  double get progress => completedCount / 5;
}

/// Yetishmayotgan qadam.
enum ReadinessStep {
  profile,
  identityDocument,
  driverLicense,
  verifiedVehicle,
  routes,
  other;

  static ReadinessStep fromApi(String? value) => switch (value) {
        'PROFILE' => ReadinessStep.profile,
        'IDENTITY_DOCUMENT' => ReadinessStep.identityDocument,
        'DRIVER_LICENSE' => ReadinessStep.driverLicense,
        'VERIFIED_VEHICLE' => ReadinessStep.verifiedVehicle,
        'ROUTES' => ReadinessStep.routes,
        _ => ReadinessStep.other,
      };

  String get label => switch (this) {
        ReadinessStep.profile => 'Profilni toʻldiring',
        ReadinessStep.identityDocument => 'Pasport yuklang',
        ReadinessStep.driverLicense => 'Haydovchilik guvohnomasini yuklang',
        ReadinessStep.verifiedVehicle => 'Transport qoʻshing va tasdiqlating',
        ReadinessStep.routes => 'Yoʻnalishlaringizni koʻrsating',
        ReadinessStep.other => 'Qoʻshimcha maʼlumot kerak',
      };

  /// NEGA kerakligi — quruq talab qarshilik uyg'otadi.
  String get reason => switch (this) {
        ReadinessStep.profile => 'Mijoz kim bilan ishlayotganini bilishi kerak',
        ReadinessStep.identityDocument =>
          'Shaxsni tasdiqlash — mijozlar uchun asosiy xavfsizlik chorasi',
        ReadinessStep.driverLicense =>
          'Guvohnomasiz haydovchi platformada ishlay olmaydi',
        ReadinessStep.verifiedVehicle =>
          'Yuk qaysi transportda ketishini mijoz oldindan bilishi kerak',
        ReadinessStep.routes =>
          'Yoʻnalish koʻrsatilsa, tizim sizga mos yuklarni oʻzi topib beradi',
        ReadinessStep.other => '',
      };
}

/// Haydovchining doimiy yo'nalishi.
///
/// MATCHING UCHUN ENG KUCHLI SIGNAL: yo'nalishi mos haydovchi Match
/// Score'da sezilarli ustunlikka ega bo'ladi. Shuning uchun uni
/// to'ldirish foydalanuvchiga foyda sifatida tushuntiriladi.
class DriverRoute {
  const DriverRoute({
    required this.id,
    required this.fromRegionId,
    required this.fromRegionName,
    required this.isRegular,
    required this.priority,
    this.toRegionId,
    this.toRegionName,
  });

  factory DriverRoute.fromJson(Map<String, dynamic> json) => DriverRoute(
        // BIGSERIAL — `pg` uni SATR qilib qaytaradi (aniqlik
        // yoʻqolmasligi uchun). Sonlarga oʻgirmaymiz: identifikator
        // faqat URL'ga qoʻyiladi va u bilan hisob qilinmaydi.
        id: json['id']?.toString() ?? '',
        fromRegionId: (json['fromRegionId'] as num?)?.toInt() ?? 0,
        fromRegionName: json['fromRegionName'] as String? ?? '',
        isRegular: json['isRegular'] as bool? ?? false,
        priority: (json['priority'] as num?)?.toInt() ?? 0,
        toRegionId: (json['toRegionId'] as num?)?.toInt(),
        toRegionName: json['toRegionName'] as String?,
      );

  final String id;
  final int fromRegionId;
  final String fromRegionName;

  /// `null` — "istalgan yo'nalishga".
  final int? toRegionId;
  final String? toRegionName;

  /// Doimiy yo'nalish — matchingda qo'shimcha ustunlik beradi.
  final bool isRegular;
  final int priority;

  String get label =>
      '$fromRegionName → ${toRegionName ?? 'istalgan yoʻnalish'}';
}

/// Yuk e'loni holati.
enum LoadStatus {
  draft,
  published,
  matching,
  offersReceived,
  assigned,
  inProgress,
  completed,
  cancelled,
  expired;

  static LoadStatus fromApi(String? value) => switch (value) {
        'DRAFT' => LoadStatus.draft,
        'PUBLISHED' => LoadStatus.published,
        'MATCHING' => LoadStatus.matching,
        'OFFERS_RECEIVED' => LoadStatus.offersReceived,
        'ASSIGNED' => LoadStatus.assigned,
        'IN_PROGRESS' => LoadStatus.inProgress,
        'COMPLETED' => LoadStatus.completed,
        'CANCELLED' => LoadStatus.cancelled,
        'EXPIRED' => LoadStatus.expired,
        _ => LoadStatus.draft,
      };

  String get label => switch (this) {
        LoadStatus.draft => 'Qoralama',
        LoadStatus.published => 'Eʼlon qilingan',
        LoadStatus.matching => 'Haydovchi qidirilmoqda',
        LoadStatus.offersReceived => 'Takliflar bor',
        LoadStatus.assigned => 'Haydovchi topildi',
        LoadStatus.inProgress => 'Yoʻlda',
        LoadStatus.completed => 'Yakunlangan',
        LoadStatus.cancelled => 'Bekor qilingan',
        LoadStatus.expired => 'Muddati oʻtgan',
      };

  /// E'lon hali taklif qabul qiladimi.
  bool get isOpen =>
      this == LoadStatus.published ||
      this == LoadStatus.matching ||
      this == LoadStatus.offersReceived;

  /// Tahrirlash mumkinmi.
  bool get isEditable => this == LoadStatus.draft || isOpen;
}

class LoadPoint {
  const LoadPoint({
    required this.address,
    required this.lat,
    required this.lng,
    this.regionName,
    this.contactName,
    this.contactPhone,
  });

  factory LoadPoint.fromJson(Map<String, dynamic> json) {
    return LoadPoint(
      address: json['address'] as String? ?? '',
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0,
      regionName: json['regionName'] as String?,
      contactName: json['contactName'] as String?,
      // Buyurtma tasdiqlangunicha backend maskalangan raqam qaytaradi
      contactPhone: json['contactPhone'] as String?,
    );
  }

  final String address;
  final double lat;
  final double lng;
  final String? regionName;
  final String? contactName;
  final String? contactPhone;

  /// Ro'yxatda qisqa ko'rsatish uchun: viloyat nomi yoki manzilning
  /// birinchi qismi.
  String get shortLabel {
    if (regionName != null && regionName!.isNotEmpty) return regionName!;
    final firstPart = address.split(',').first.trim();
    return firstPart.isEmpty ? address : firstPart;
  }
}

class Load {
  const Load({
    required this.id,
    required this.publicNo,
    required this.title,
    required this.status,
    required this.weightKg,
    required this.pickup,
    required this.delivery,
    required this.pickupFrom,
    required this.pickupTo,
    this.volumeM3,
    this.priceTiyin,
    this.isNegotiable = false,
    this.distanceKm,
    this.durationMin,
    this.distanceToPickupKm,
    this.categoryName,
    this.offerCount = 0,
    this.viewCount = 0,
    this.paymentMethod = 'CASH',
    this.matchScore,
    this.matchReasons = const [],
    this.createdAt,
  });

  factory Load.fromJson(Map<String, dynamic> json) {
    return Load(
      id: json['id'] as String,
      publicNo: json['publicNo'] as String? ?? '',
      title: json['title'] as String? ?? '',
      status: LoadStatus.fromApi(json['status'] as String?),
      weightKg: (json['weightKg'] as num?)?.toInt() ?? 0,
      volumeM3: (json['volumeM3'] as num?)?.toDouble(),
      pickup: LoadPoint.fromJson(json['pickup'] as Map<String, dynamic>? ?? const {}),
      delivery: LoadPoint.fromJson(json['delivery'] as Map<String, dynamic>? ?? const {}),
      pickupFrom: DateTime.tryParse('${json['pickupFrom']}') ?? DateTime.now(),
      pickupTo: DateTime.tryParse('${json['pickupTo']}') ?? DateTime.now(),
      // Pul har doim satr — BigInt bilan ishlanadi
      priceTiyin: json['priceTiyin']?.toString(),
      isNegotiable: json['isNegotiable'] as bool? ?? false,
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      durationMin: (json['durationMin'] as num?)?.toInt(),
      distanceToPickupKm: (json['distanceToPickupKm'] as num?)?.toDouble(),
      categoryName: json['categoryName'] as String?,
      offerCount: (json['offerCount'] as num?)?.toInt() ?? 0,
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
      paymentMethod: json['paymentMethod'] as String? ?? 'CASH',
      matchScore: (json['matchScore'] as num?)?.toDouble(),
      matchReasons:
          (json['reasons'] as List<dynamic>?)?.map((e) => '$e').toList() ?? const [],
      createdAt: DateTime.tryParse('${json['createdAt']}'),
    );
  }

  final String id;
  final String publicNo;
  final String title;
  final LoadStatus status;
  final int weightKg;
  final double? volumeM3;
  final LoadPoint pickup;
  final LoadPoint delivery;
  final DateTime pickupFrom;
  final DateTime pickupTo;
  final String? priceTiyin;
  final bool isNegotiable;
  final double? distanceKm;
  final int? durationMin;

  /// Haydovchidan olish nuqtasigacha masofa — faqat lentada keladi.
  final double? distanceToPickupKm;

  final String? categoryName;
  final int offerCount;
  final int viewCount;
  final String paymentMethod;

  /// Match Score (0..100) — faqat matching natijasida keladi.
  final double? matchScore;
  final List<String> matchReasons;

  final DateTime? createdAt;

  bool get hasPrice => priceTiyin != null && priceTiyin != '0';
  bool get isEscrow => paymentMethod == 'ESCROW';

  /// Yuklash vaqti o'tib ketganmi.
  bool get isExpired => pickupTo.isBefore(DateTime.now());

  /// Shoshilinch: yuklashgacha 6 soatdan kam qoldi.
  ///
  /// Bunday e'lonlar lentada alohida belgilanadi — haydovchi tez qaror
  /// qabul qilishi kerak va bu unga qo'shimcha imkoniyat beradi.
  bool get isUrgent {
    final hoursLeft = pickupFrom.difference(DateTime.now()).inHours;
    return hoursLeft >= 0 && hoursLeft <= 6;
  }
}

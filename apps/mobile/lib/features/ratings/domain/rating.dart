/// Ikki tomonlama baho.
///
/// KO'R-KO'RONA SXEMA: baho hamkor ham baho bermaguncha YASHIRIN
/// turadi. Bu o'ch olish maqsadidagi past baholarning oldini oladi —
/// aks holda birinchi baho beruvchi javob sifatida past baho olishdan
/// qo'rqib, halol baho bermaydi. 14 kun ichida hamkor javob bermasa
/// baho baribir ochiladi.
class Rating {
  const Rating({
    required this.id,
    required this.orderId,
    required this.score,
    required this.direction,
    required this.isVisible,
    required this.createdAt,
    this.punctuality,
    this.communication,
    this.cargoCondition,
    this.reliability,
    this.comment,
    this.raterName,
  });

  factory Rating.fromJson(Map<String, dynamic> json) {
    final rater = json['rater'] as Map<String, dynamic>?;
    final name = rater == null
        ? null
        : [rater['firstName'], rater['lastName']]
            .where((part) => part != null && '$part'.isNotEmpty)
            .join(' ');

    return Rating(
      id: json['id'] as String? ?? '',
      orderId: json['orderId'] as String? ?? '',
      score: (json['score'] as num?)?.toInt() ?? 0,
      direction: RatingDirection.fromApi(json['direction'] as String?),
      isVisible: json['isVisible'] as bool? ?? false,
      createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
      punctuality: (json['punctuality'] as num?)?.toInt(),
      communication: (json['communication'] as num?)?.toInt(),
      cargoCondition: (json['cargoCondition'] as num?)?.toInt(),
      reliability: (json['reliability'] as num?)?.toInt(),
      comment: json['comment'] as String?,
      raterName: (name?.isEmpty ?? true) ? null : name,
    );
  }

  final String id;
  final String orderId;

  /// Umumiy baho: 1..5.
  final int score;
  final RatingDirection direction;

  /// Ochilganmi. Yopiq bo'lsa faqat o'zining bahosi ko'rinadi.
  final bool isVisible;
  final DateTime createdAt;

  final int? punctuality;
  final int? communication;

  /// Yuk holati — FAQAT mijozdan haydovchiga. Haydovchi mijozning
  /// yukini baholay olmaydi: u yukni ko'rgan, lekin uni tayyorlamagan.
  final int? cargoCondition;
  final int? reliability;

  final String? comment;

  /// Kim baho berdi (ochiq profilda).
  final String? raterName;

  bool get hasComment => comment != null && comment!.trim().isNotEmpty;
}

/// Baho yo'nalishi.
enum RatingDirection {
  shipperToDriver,
  driverToShipper;

  static RatingDirection fromApi(String? value) =>
      value == 'DRIVER_TO_SHIPPER'
          ? RatingDirection.driverToShipper
          : RatingDirection.shipperToDriver;

  bool get isFromShipper => this == RatingDirection.shipperToDriver;
}

/// Baho kutayotgan buyurtma.
class PendingRating {
  const PendingRating({
    required this.orderId,
    required this.publicNo,
    required this.counterpartyName,
    required this.deadline,
  });

  factory PendingRating.fromJson(Map<String, dynamic> json) => PendingRating(
        orderId: json['orderId'] as String? ?? '',
        publicNo: json['publicNo']?.toString() ?? '',
        counterpartyName: json['counterpartyName'] as String? ?? 'Hamkor',
        deadline: DateTime.tryParse('${json['deadline']}') ?? DateTime.now(),
      );

  final String orderId;
  final String publicNo;
  final String counterpartyName;

  /// Shu vaqtgacha baho berish mumkin.
  final DateTime deadline;

  /// Necha kun qoldi. Manfiy — muddat o'tgan.
  int get daysLeft => deadline.difference(DateTime.now()).inDays;

  /// Muddat yaqinlashdi — eslatmani ko'proq ta'kidlash kerak.
  bool get isUrgent => daysLeft <= 3;
}

/// Baho shakli — forma to'ldirilayotgandagi holat.
class RatingDraft {
  const RatingDraft({
    this.score = 0,
    this.punctuality,
    this.communication,
    this.cargoCondition,
    this.reliability,
    this.comment = '',
  });

  /// Umumiy baho — YAGONA MAJBURIY maydon.
  ///
  /// Qolgan mezonlar ixtiyoriy: majburiy qilinsa foydalanuvchi
  /// hammasiga "5" qo'yib qutuladi va baho ma'nosini yo'qotadi.
  final int score;

  final int? punctuality;
  final int? communication;
  final int? cargoCondition;
  final int? reliability;
  final String comment;

  bool get isValid => score >= 1 && score <= 5;

  Map<String, dynamic> toJson() => {
        'score': score,
        if (punctuality != null) 'punctuality': punctuality,
        if (communication != null) 'communication': communication,
        if (cargoCondition != null) 'cargoCondition': cargoCondition,
        if (reliability != null) 'reliability': reliability,
        if (comment.trim().isNotEmpty) 'comment': comment.trim(),
      };

  RatingDraft copyWith({
    int? score,
    int? punctuality,
    int? communication,
    int? cargoCondition,
    int? reliability,
    String? comment,
  }) {
    return RatingDraft(
      score: score ?? this.score,
      punctuality: punctuality ?? this.punctuality,
      communication: communication ?? this.communication,
      cargoCondition: cargoCondition ?? this.cargoCondition,
      reliability: reliability ?? this.reliability,
      comment: comment ?? this.comment,
    );
  }
}

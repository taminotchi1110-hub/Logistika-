/// Hamyon balansi.
///
/// PUL TIYINDA VA SATR SIFATIDA: `double` katta summalarda aniqlikni
/// yo'qotadi va foydalanuvchi ekranda ko'rgan raqam serverdagidan
/// farq qilsa, ishonch yo'qoladi.
class Wallet {
  const Wallet({
    required this.balanceTiyin,
    required this.creditLimitTiyin,
    required this.canTakeOrders,
    required this.debtToPayTiyin,
    this.formatted,
  });

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
        balanceTiyin: json['balanceTiyin']?.toString() ?? '0',
        creditLimitTiyin: json['creditLimitTiyin']?.toString() ?? '0',
        canTakeOrders: json['canTakeOrders'] as bool? ?? true,
        debtToPayTiyin: json['debtToPayTiyin']?.toString() ?? '0',
        formatted: json['formatted'] as String?,
      );

  final String balanceTiyin;

  /// Haydovchi balansi qanchagacha manfiy bo'lishi mumkin.
  ///
  /// NAQD BUYURTMALARDA KOMISSIYA HAMYONDAN YECHILADI: haydovchi pulni
  /// qo'lga oladi, platforma ulushi esa qarzga yoziladi. Limit bo'lmasa
  /// haydovchi cheksiz qarz yig'ib ketaverardi.
  final String creditLimitTiyin;

  /// Qarz limitdan oshgan bo'lsa yangi buyurtma olib bo'lmaydi.
  final bool canTakeOrders;

  /// Buyurtma olish uchun to'lash kerak bo'lgan summa.
  final String debtToPayTiyin;

  /// Server tayyorlagan ko'rsatish matni (bo'lsa).
  final String? formatted;

  bool get isNegative => balanceTiyin.startsWith('-');
  bool get hasDebt => debtToPayTiyin != '0' && !debtToPayTiyin.startsWith('-');
}

/// Hamyon harakati.
class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.amountTiyin,
    required this.balanceAfterTiyin,
    required this.type,
    required this.description,
    required this.createdAt,
    this.orderId,
  });

  factory LedgerEntry.fromJson(Map<String, dynamic> json) => LedgerEntry(
        id: json['id']?.toString() ?? '',
        amountTiyin: json['amountTiyin']?.toString() ?? '0',
        // Har bir yozuvda amaldan keyingi balans — mijoz hisobni
        // o'zi tekshira oladi
        balanceAfterTiyin: json['balanceAfterTiyin']?.toString() ?? '0',
        type: LedgerEntryType.fromApi(json['entryType'] as String?),
        description: json['description'] as String? ?? '',
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
        orderId: json['orderId'] as String?,
      );

  final String id;
  final String amountTiyin;
  final String balanceAfterTiyin;
  final LedgerEntryType type;
  final String description;
  final DateTime createdAt;
  final String? orderId;

  /// Pul kirdimi. Manfiy summa — chiqim.
  bool get isIncome => !amountTiyin.startsWith('-');
}

/// Harakat turi.
///
/// Ro'yxat backend'dagi `ledger_entry_type` bilan mos. Noma'lum tur
/// ilovani buzmasligi kerak: server yangi tur qo'shsa eski ilova
/// uni "boshqa" deb ko'rsatadi.
enum LedgerEntryType {
  topup,
  escrowHold,
  escrowRelease,
  escrowRefund,
  commission,
  payout,
  payoutReversal,
  penalty,
  bonus,
  subscription,
  adjustment,
  other;

  static LedgerEntryType fromApi(String? value) => switch (value) {
        'TOPUP' => LedgerEntryType.topup,
        'ESCROW_HOLD' => LedgerEntryType.escrowHold,
        'ESCROW_RELEASE' => LedgerEntryType.escrowRelease,
        'ESCROW_REFUND' => LedgerEntryType.escrowRefund,
        'COMMISSION' => LedgerEntryType.commission,
        'PAYOUT' => LedgerEntryType.payout,
        'PAYOUT_REVERSAL' => LedgerEntryType.payoutReversal,
        'PENALTY' => LedgerEntryType.penalty,
        'BONUS' => LedgerEntryType.bonus,
        'SUBSCRIPTION' => LedgerEntryType.subscription,
        'ADJUSTMENT' => LedgerEntryType.adjustment,
        _ => LedgerEntryType.other,
      };

  // Tur nomi joriy tilda — `presentation/wallet_l10n.dart`.
}

/// To'lov (hisob to'ldirish).
class Payment {
  const Payment({
    required this.id,
    required this.provider,
    required this.amountTiyin,
    required this.status,
    required this.createdAt,
    this.checkoutUrl,
    this.paidAt,
  });

  factory Payment.fromJson(Map<String, dynamic> json) => Payment(
        id: json['id'] as String? ?? '',
        provider: json['provider'] as String? ?? '',
        amountTiyin: json['amountTiyin']?.toString() ?? '0',
        status: json['status'] as String? ?? 'CREATED',
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
        checkoutUrl: json['checkoutUrl'] as String?,
        paidAt: DateTime.tryParse('${json['paidAt']}'),
      );

  final String id;

  /// `CLICK` yoki `PAYME`.
  final String provider;
  final String amountTiyin;
  final String status;
  final DateTime createdAt;

  /// PSP sahifasiga havola. Pul FAQAT PSP tasdiqlagach qo'shiladi —
  /// havolani ochmasdan balans oshmaydi.
  final String? checkoutUrl;
  final DateTime? paidAt;

  bool get isPaid => status == 'PAID';
  bool get isPending => status == 'CREATED' || status == 'PENDING';
}

/// Pul yechish so'rovi.
class Payout {
  const Payout({
    required this.id,
    required this.amountTiyin,
    required this.cardMask,
    required this.status,
    required this.requestedAt,
    this.processedAt,
    this.failureReason,
  });

  factory Payout.fromJson(Map<String, dynamic> json) => Payout(
        id: json['id'] as String? ?? '',
        amountTiyin: json['amountTiyin']?.toString() ?? '0',
        // KARTA RAQAMI SAQLANMAYDI — faqat maskalangan ko'rinish
        cardMask: json['cardMask'] as String? ?? '',
        status: json['status'] as String? ?? 'REQUESTED',
        requestedAt: DateTime.tryParse('${json['requestedAt']}') ?? DateTime.now(),
        processedAt: DateTime.tryParse('${json['processedAt']}'),
        failureReason: json['failureReason'] as String?,
      );

  final String id;
  final String amountTiyin;
  final String cardMask;
  final String status;
  final DateTime requestedAt;
  final DateTime? processedAt;
  final String? failureReason;

  bool get isDone => status == 'COMPLETED' || status == 'PAID';
  bool get isFailed => status == 'FAILED' || status == 'REJECTED';
}

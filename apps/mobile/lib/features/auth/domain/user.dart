/// Foydalanuvchi roli.
///
/// `both` — bir odam ham yuk beradi, ham tashiydi. O'zbekistonda bu
/// keng tarqalgan: kichik biznes egasi o'z yukini ham tashiydi,
/// bo'sh qaytishda boshqalarning yukini ham oladi.
enum UserRole {
  shipper,
  driver,
  both;

  static UserRole fromApi(String? value) => switch (value) {
        'SHIPPER' => UserRole.shipper,
        'DRIVER' => UserRole.driver,
        'BOTH' => UserRole.both,
        _ => UserRole.shipper,
      };

  String get api => switch (this) {
        UserRole.shipper => 'SHIPPER',
        UserRole.driver => 'DRIVER',
        UserRole.both => 'BOTH',
      };

  String get label => switch (this) {
        UserRole.shipper => 'Yuk beruvchi',
        UserRole.driver => 'Haydovchi',
        UserRole.both => 'Ikkalasi',
      };

  bool get canShip => this == UserRole.shipper || this == UserRole.both;
  bool get canDrive => this == UserRole.driver || this == UserRole.both;
}

enum UserStatus {
  pendingProfile,
  active,
  suspended,
  banned,
  deleted;

  static UserStatus fromApi(String? value) => switch (value) {
        'PENDING_PROFILE' => UserStatus.pendingProfile,
        'ACTIVE' => UserStatus.active,
        'SUSPENDED' => UserStatus.suspended,
        'BANNED' => UserStatus.banned,
        'DELETED' => UserStatus.deleted,
        _ => UserStatus.pendingProfile,
      };

  bool get canUseApp => this == UserStatus.active;
}

class AppUser {
  const AppUser({
    required this.id,
    required this.phone,
    required this.role,
    required this.status,
    this.firstName,
    this.lastName,
    this.avatarUrl,
    this.lang = 'uz',
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.completedOrders = 0,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as String,
      phone: json['phone'] as String? ?? '',
      role: UserRole.fromApi(json['role'] as String?),
      status: UserStatus.fromApi(json['status'] as String?),
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      lang: json['lang'] as String? ?? 'uz',
      // Backend NUMERIC ni satr qilib qaytaradi
      ratingAvg: double.tryParse('${json['ratingAvg'] ?? 0}') ?? 0,
      ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
      completedOrders: (json['completedOrders'] as num?)?.toInt() ?? 0,
    );
  }

  final String id;
  final String phone;
  final UserRole role;
  final UserStatus status;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final String lang;
  final double ratingAvg;
  final int ratingCount;
  final int completedOrders;

  String get fullName {
    final parts = [firstName, lastName].where((p) => p != null && p.isNotEmpty);
    return parts.isEmpty ? 'Foydalanuvchi' : parts.join(' ');
  }

  /// Avatar o'rniga ko'rsatiladigan harflar.
  String get initials {
    final first = (firstName ?? '').trim();
    final last = (lastName ?? '').trim();

    if (first.isEmpty && last.isEmpty) return '?';
    if (last.isEmpty) return first[0].toUpperCase();
    if (first.isEmpty) return last[0].toUpperCase();

    return '${first[0]}${last[0]}'.toUpperCase();
  }

  /// Reytingi bormi — yangi foydalanuvchida "yangi" deb ko'rsatiladi,
  /// "0.0 ★" emas (bu yomon baho kabi ko'rinadi).
  bool get hasRating => ratingCount > 0;

  AppUser copyWith({
    UserRole? role,
    UserStatus? status,
    String? firstName,
    String? lastName,
    String? avatarUrl,
    String? lang,
  }) {
    return AppUser(
      id: id,
      phone: phone,
      role: role ?? this.role,
      status: status ?? this.status,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      lang: lang ?? this.lang,
      ratingAvg: ratingAvg,
      ratingCount: ratingCount,
      completedOrders: completedOrders,
    );
  }
}

/// OTP so'ralgandan keyingi holat.
class OtpChallenge {
  const OtpChallenge({
    required this.phone,
    required this.expiresInSeconds,
    required this.resendAfterSeconds,
    this.devCode,
  });

  factory OtpChallenge.fromJson(String phone, Map<String, dynamic> json) {
    return OtpChallenge(
      phone: phone,
      expiresInSeconds: (json['expiresInSeconds'] as num?)?.toInt() ?? 300,
      resendAfterSeconds: (json['resendAfterSeconds'] as num?)?.toInt() ?? 60,
      // Faqat dev muhitida keladi — testlashni tezlashtiradi
      devCode: json['devCode'] as String?,
    );
  }

  final String phone;
  final int expiresInSeconds;
  final int resendAfterSeconds;
  final String? devCode;
}

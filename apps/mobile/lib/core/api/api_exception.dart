/// Backend xatolari.
///
/// ASOSIY QOIDA: foydalanuvchiga ko'rsatiladigan matn KOD bo'yicha
/// tanlanadi, serverdan kelgan `message` emas. Sabablar:
///
///   1. Server matni faqat o'zbekcha. Mijoz ruscha yoki inglizcha
///      ishlatayotgan bo'lishi mumkin.
///   2. Server matni texnik bo'lishi mumkin ("Yuk holati: ASSIGNED").
///      Foydalanuvchiga tushunarli matn kerak.
///   3. Kod barqaror, matn esa o'zgarishi mumkin.
///
/// Serverdagi `message` faqat zaxira: noma'lum kod kelganda.
library;

class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
    this.requestId,
  });

  /// Barqaror xato kodi (`OTP_COOLDOWN`, `WALLET_INSUFFICIENT_FUNDS`).
  final String code;

  /// Serverdan kelgan matn — zaxira sifatida.
  final String message;

  final int? statusCode;
  final Map<String, dynamic>? details;

  /// Qo'llab-quvvatlash xizmatiga murojaatda kerak bo'ladi.
  final String? requestId;

  /// Tarmoq uzilgan — qayta urinish mantiqiy.
  bool get isNetwork => code == 'NETWORK_ERROR' || code == 'TIMEOUT';

  /// Token eskirgan — yangilash kerak.
  bool get isAuthExpired => code == 'AUTH_TOKEN_EXPIRED';

  /// Qayta kirish kerak.
  bool get requiresLogin =>
      code == 'AUTH_UNAUTHORIZED' ||
      code == 'AUTH_TOKEN_INVALID' ||
      code == 'AUTH_SESSION_REVOKED' ||
      code == 'AUTH_REFRESH_REUSED';

  /// Qayta urinishdan oldin kutish kerak bo'lgan soniyalar.
  int? get retryAfterSeconds {
    final value = details?['retryAfterSeconds'];
    return value is int ? value : int.tryParse('$value');
  }

  @override
  String toString() => 'ApiException($code): $message';
}

/// Xato kodini foydalanuvchi tiliga o'giradi.
///
/// Bu jadval `apps/api/src/common/errors/error-codes.ts` bilan mos
/// bo'lishi kerak. Yangi kod qo'shilganda bu yerga ham qo'shiladi —
/// aks holda foydalanuvchi serverning texnik matnini ko'radi.
String localizeError(ApiException error) {
  return switch (error.code) {
    // --- tarmoq ---
    'NETWORK_ERROR' => 'Internet aloqasi yoʻq. Ulanishni tekshiring.',
    'TIMEOUT' => 'Server javob bermadi. Qayta urinib koʻring.',

    // --- autentifikatsiya ---
    'AUTH_UNAUTHORIZED' => 'Iltimos, qaytadan kiring',
    'AUTH_TOKEN_EXPIRED' => 'Sessiya muddati tugadi',
    'AUTH_TOKEN_INVALID' => 'Sessiya yaroqsiz. Qaytadan kiring.',
    'AUTH_SESSION_REVOKED' => 'Sessiya yopilgan. Qaytadan kiring.',

    // --- OTP ---
    'OTP_INVALID_PHONE' => 'Telefon raqami notoʻgʻri',
    'OTP_COOLDOWN' => _cooldownMessage(error),
    'OTP_TOO_MANY_REQUESTS' => 'Juda koʻp urinish. Keyinroq qayta urinib koʻring.',
    'OTP_NOT_FOUND' => 'Kod topilmadi. Yangi kod soʻrang.',
    'OTP_EXPIRED' => 'Kod muddati tugadi. Yangi kod soʻrang.',
    'OTP_INCORRECT' => _attemptsMessage(error),
    'OTP_TOO_MANY_ATTEMPTS' => 'Juda koʻp notoʻgʻri urinish. Yangi kod soʻrang.',
    'OTP_SEND_FAILED' => 'SMS yuborilmadi. Keyinroq urinib koʻring.',

    // --- foydalanuvchi ---
    'USER_BANNED' => 'Akkauntingiz bloklangan. Qoʻllab-quvvatlashga murojaat qiling.',
    'USER_SUSPENDED' => 'Akkauntingiz vaqtincha toʻxtatilgan',
    'USER_PROFILE_INCOMPLETE' => 'Avval profilni toʻldiring',
    'USER_ROLE_NOT_ALLOWED' => 'Bu amal sizning rolingiz uchun mavjud emas',

    // --- haydovchi va transport ---
    'DRIVER_NOT_VERIFIED' => 'Avval verifikatsiyani yakunlang',
    'VEHICLE_NOT_VERIFIED' => 'Transport hali tasdiqlanmagan',
    'VEHICLE_CAPACITY_EXCEEDED' => 'Transport quvvati bu yuk uchun yetarli emas',
    'VEHICLE_PLATE_TAKEN' => 'Bu davlat raqami allaqachon roʻyxatdan oʻtgan',
    'VEHICLE_PLATE_INVALID' => 'Davlat raqami notoʻgʻri. Namuna: 01 A 123 BC',
    'VEHICLE_LOCKED_AFTER_VERIFY' =>
      'Tasdiqlangan transport parametrlarini oʻzgartirib boʻlmaydi',
    'VEHICLE_LIMIT_REACHED' => 'Transport soni chegarasiga yetdingiz',

    // --- yuk ---
    'LOAD_NOT_ACCEPTING_OFFERS' => 'Bu yuk endi takliflar qabul qilmaydi',
    'LOAD_ALREADY_ASSIGNED' => 'Yuk allaqachon band',
    'LOAD_ALREADY_CLOSED' => 'Yuk yopilgan',
    'LOAD_HAS_ORDER' => 'Buyurtma tuzilgan. Bekor qilish buyurtma orqali.',
    'LOAD_PICKUP_TIME_PASSED' => 'Yuklash vaqti oʻtib ketgan',
    'LOAD_TIME_WINDOW_INVALID' => 'Sana oraligʻi notoʻgʻri',
    'LOAD_PRICE_REQUIRED' => 'Narxni koʻrsating yoki "kelishuv asosida" belgilang',
    'LOAD_NOT_PUBLISHABLE' => 'Faqat qoralamani eʼlon qilish mumkin',
    'LOAD_NOT_EDITABLE' => 'Bu holatdagi yukni tahrirlab boʻlmaydi',
    'LOAD_ACTIVE_LIMIT_REACHED' => 'Faol eʼlonlar soni chegarasiga yetdingiz',

    // --- taklif ---
    'OFFER_OWN_LOAD' => 'Oʻz yukingizga taklif yubora olmaysiz',
    'OFFER_DUPLICATE' => 'Siz bu yukka allaqachon taklif yuborgansiz',
    'OFFER_ALREADY_HANDLED' => 'Taklif allaqachon koʻrib chiqilgan',
    'OFFER_EXPIRED' => 'Taklif muddati tugagan',
    'OFFER_PRICE_REQUIRED' => 'Oʻz narxingizni koʻrsating',
    'OFFER_PRICE_OUT_OF_RANGE' => 'Taklif narxi eʼlon narxidan juda farq qiladi',

    // --- buyurtma ---
    'ORDER_INVALID_TRANSITION' => 'Bu amalni hozir bajarib boʻlmaydi',
    'ORDER_ACTOR_NOT_ALLOWED' => 'Bu amalni hamkoringiz bajaradi',
    'ORDER_CONTACTS_ALREADY_VISIBLE' => 'Telefon raqamlari allaqachon ochiq',

    // --- chat ---
    'CHAT_CLOSED' => 'Bu suhbatda yozib boʻlmaydi',
    'CHAT_MESSAGE_EMPTY' => 'Xabar boʻsh boʻlishi mumkin emas',
    'CHAT_ATTACHMENT_MISSING' => 'Fayl tanlanmagan',

    // --- kuzatuv ---
    'TRACKING_NOT_ACTIVE' => 'Kuzatuv faqat faol reys davomida ishlaydi',

    // --- hamyon va toʻlov ---
    'WALLET_INSUFFICIENT_FUNDS' => 'Hamyonda mablagʻ yetarli emas',
    'WALLET_LOCKED' => 'Hamyon bloklangan',
    'PAYMENT_AMOUNT_INVALID' => 'Summa notoʻgʻri',
    'PAYMENT_ALREADY_PAID' => 'Toʻlov allaqachon amalga oshirilgan',
    'PAYMENT_PROVIDER_ERROR' => 'Toʻlov tizimida xatolik. Keyinroq urinib koʻring.',
    'PAYOUT_TOO_SMALL' => 'Yechish uchun summa juda kichik',
    'PAYOUT_ALREADY_PENDING' => 'Sizda hali koʻrib chiqilmagan soʻrov bor',

    // --- reyting ---
    'RATING_NOT_ALLOWED_YET' => 'Baho yuk topshirilgandan keyin beriladi',
    'RATING_ALREADY_GIVEN' => 'Siz allaqachon baho bergansiz',
    'RATING_WINDOW_CLOSED' => 'Baho berish muddati tugagan',

    // --- fayl ---
    'FILE_KEY_NOT_OWNED' => 'Fayl sizga tegishli emas',
    'FILE_NOT_UPLOADED' => 'Fayl yuklanmagan',
    'FILE_DELETE_FORBIDDEN' => 'Tasdiqlangan hujjatni oʻchirib boʻlmaydi',

    // --- umumiy ---
    'VALIDATION_FAILED' => _validationMessage(error),
    'NOT_FOUND' => 'Topilmadi',
    'FORBIDDEN' => 'Ruxsat yoʻq',
    'RATE_LIMITED' => 'Juda koʻp soʻrov. Biroz kuting.',
    'SERVICE_UNAVAILABLE' => 'Xizmat vaqtincha ishlamayapti',
    'REFERENCE_NOT_FOUND' => 'Maʼlumot topilmadi',

    // Noma'lum kod — serverning matni (zaxira)
    _ => error.message,
  };
}

String _cooldownMessage(ApiException error) {
  final seconds = error.retryAfterSeconds;
  return seconds == null
      ? 'Biroz kuting va qayta urinib koʻring'
      : '$seconds soniyadan keyin qayta yuborish mumkin';
}

String _attemptsMessage(ApiException error) {
  final left = error.details?['attemptsLeft'];
  return left == null
      ? 'Kod notoʻgʻri'
      : 'Kod notoʻgʻri. Qolgan urinishlar: $left';
}

String _validationMessage(ApiException error) {
  final fields = error.details?['fields'];
  if (fields is List && fields.isNotEmpty) {
    // Backend maydon xatolarini inglizcha qaytaradi ("phone must be...").
    // Ularni koʻrsatmaymiz — umumiy matn tushunarliroq.
    return 'Kiritilgan maʼlumotda xatolik bor';
  }
  return 'Kiritilgan maʼlumot notoʻgʻri';
}

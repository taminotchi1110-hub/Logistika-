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

import 'package:flutter/widgets.dart';
import 'package:karvon/l10n/app_localizations.dart';

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
///
/// `BuildContext` QABUL QILADI, `AppLocalizations` emas: chaqiruv
/// joylari (21 ta) vidjetlar ichida va ularning hammasida kontekst
/// bor. `AppLocalizations.of(context)` ni har bir joyda yozish
/// takrorlanuvchi shovqin bo'lardi.
String localizeError(BuildContext context, ApiException error) =>
    localizeErrorWith(AppLocalizations.of(context), error);

/// Kontekstsiz variant — testlar va kontekstdan tashqari kod uchun.
String localizeErrorWith(AppLocalizations l10n, ApiException error) {
  return switch (error.code) {
    // --- tarmoq ---
    'NETWORK_ERROR' => l10n.errNetwork,
    'TIMEOUT' => l10n.errTimeout,
    // Mijoz tomonida yasaladi (`documents_repository.dart`)
    'FILE_TOO_LARGE' => l10n.errFileTooLarge,
    'UPLOAD_FAILED' => l10n.errUploadFailed,

    // --- autentifikatsiya ---
    'AUTH_UNAUTHORIZED' => l10n.errAuthUnauthorized,
    'AUTH_TOKEN_EXPIRED' => l10n.errAuthTokenExpired,
    'AUTH_TOKEN_INVALID' => l10n.errAuthTokenInvalid,
    'AUTH_SESSION_REVOKED' => l10n.errAuthSessionRevoked,

    // --- OTP ---
    'OTP_INVALID_PHONE' => l10n.errOtpInvalidPhone,
    'OTP_COOLDOWN' => _cooldownMessage(l10n, error),
    'OTP_TOO_MANY_REQUESTS' => l10n.errOtpTooManyRequests,
    'OTP_NOT_FOUND' => l10n.errOtpNotFound,
    'OTP_EXPIRED' => l10n.errOtpExpired,
    'OTP_INCORRECT' => _attemptsMessage(l10n, error),
    'OTP_TOO_MANY_ATTEMPTS' => l10n.errOtpTooManyAttempts,
    'OTP_SEND_FAILED' => l10n.errOtpSendFailed,

    // --- foydalanuvchi ---
    'USER_BANNED' => l10n.errUserBanned,
    'USER_SUSPENDED' => l10n.errUserSuspended,
    'USER_PROFILE_INCOMPLETE' => l10n.errUserProfileIncomplete,
    'USER_ROLE_NOT_ALLOWED' => l10n.errUserRoleNotAllowed,

    // --- haydovchi va transport ---
    'DRIVER_NOT_VERIFIED' => l10n.errDriverNotVerified,
    'VEHICLE_NOT_VERIFIED' => l10n.errVehicleNotVerified,
    'VEHICLE_CAPACITY_EXCEEDED' => l10n.errVehicleCapacityExceeded,
    'VEHICLE_PLATE_TAKEN' => l10n.errVehiclePlateTaken,
    'VEHICLE_PLATE_INVALID' => l10n.errVehiclePlateInvalid,
    'VEHICLE_LOCKED_AFTER_VERIFY' => l10n.errVehicleLockedAfterVerify,
    'VEHICLE_LIMIT_REACHED' => l10n.errVehicleLimitReached,

    // --- yuk ---
    'LOAD_NOT_ACCEPTING_OFFERS' => l10n.errLoadNotAcceptingOffers,
    'LOAD_ALREADY_ASSIGNED' => l10n.errLoadAlreadyAssigned,
    'LOAD_ALREADY_CLOSED' => l10n.errLoadAlreadyClosed,
    'LOAD_HAS_ORDER' => l10n.errLoadHasOrder,
    'LOAD_PICKUP_TIME_PASSED' => l10n.errLoadPickupTimePassed,
    'LOAD_TIME_WINDOW_INVALID' => l10n.errLoadTimeWindowInvalid,
    'LOAD_PRICE_REQUIRED' => l10n.errLoadPriceRequired,
    'LOAD_NOT_PUBLISHABLE' => l10n.errLoadNotPublishable,
    'LOAD_NOT_EDITABLE' => l10n.errLoadNotEditable,
    'LOAD_ACTIVE_LIMIT_REACHED' => l10n.errLoadActiveLimitReached,

    // --- taklif ---
    'OFFER_OWN_LOAD' => l10n.errOfferOwnLoad,
    'OFFER_DUPLICATE' => l10n.errOfferDuplicate,
    'OFFER_ALREADY_HANDLED' => l10n.errOfferAlreadyHandled,
    'OFFER_EXPIRED' => l10n.errOfferExpired,
    'OFFER_PRICE_REQUIRED' => l10n.errOfferPriceRequired,
    'OFFER_PRICE_OUT_OF_RANGE' => l10n.errOfferPriceOutOfRange,

    // --- buyurtma ---
    'ORDER_INVALID_TRANSITION' => l10n.errOrderInvalidTransition,
    'ORDER_ACTOR_NOT_ALLOWED' => l10n.errOrderActorNotAllowed,
    'ORDER_CONTACTS_ALREADY_VISIBLE' => l10n.errOrderContactsAlreadyVisible,

    // --- chat ---
    'CHAT_CLOSED' => l10n.errChatClosed,
    'CHAT_MESSAGE_EMPTY' => l10n.errChatMessageEmpty,
    'CHAT_ATTACHMENT_MISSING' => l10n.errChatAttachmentMissing,

    // --- kuzatuv ---
    'TRACKING_NOT_ACTIVE' => l10n.errTrackingNotActive,

    // --- hamyon va toʻlov ---
    'WALLET_INSUFFICIENT_FUNDS' => l10n.errWalletInsufficientFunds,
    'WALLET_LOCKED' => l10n.errWalletLocked,
    'PAYMENT_AMOUNT_INVALID' => l10n.errPaymentAmountInvalid,
    'PAYMENT_ALREADY_PAID' => l10n.errPaymentAlreadyPaid,
    'PAYMENT_PROVIDER_ERROR' => l10n.errPaymentProviderError,
    'PAYOUT_TOO_SMALL' => l10n.errPayoutTooSmall,
    'PAYOUT_ALREADY_PENDING' => l10n.errPayoutAlreadyPending,

    // --- reyting ---
    'RATING_NOT_ALLOWED_YET' => l10n.errRatingNotAllowedYet,
    'RATING_ALREADY_GIVEN' => l10n.errRatingAlreadyGiven,
    'RATING_WINDOW_CLOSED' => l10n.errRatingWindowClosed,

    // --- fayl ---
    'FILE_KEY_NOT_OWNED' => l10n.errFileKeyNotOwned,
    'FILE_NOT_UPLOADED' => l10n.errFileNotUploaded,
    'FILE_DELETE_FORBIDDEN' => l10n.errFileDeleteForbidden,

    // --- umumiy ---
    'VALIDATION_FAILED' => _validationMessage(l10n, error),
    'NOT_FOUND' => l10n.errNotFound,
    'FORBIDDEN' => l10n.errForbidden,
    'RATE_LIMITED' => l10n.errRateLimited,
    'SERVICE_UNAVAILABLE' => l10n.errServiceUnavailable,
    'REFERENCE_NOT_FOUND' => l10n.errReferenceNotFound,

    // Aniq obyekt topilmadi — foydalanuvchi uchun farqi yoʻq, qaysi
    // jadvalda qidirilgani uni qiziqtirmaydi
    'DOCUMENT_NOT_FOUND' ||
    'PAYMENT_NOT_FOUND' ||
    'USER_NOT_FOUND' ||
    'WALLET_ACCOUNT_NOT_FOUND' =>
      l10n.errNotFound,

    // Refresh token QAYTA ishlatildi — tokenni oʻgʻirlash belgisi.
    // Server hamma sessiyalarni yopgan; foydalanuvchiga "qaytadan
    // kiring" deyish yetarli, xavfsizlik tafsiloti uni qoʻrqitadi
    'AUTH_REFRESH_REUSED' => l10n.errAuthSessionRevoked,

    // 500. Serverning matni KOʻRSATILMAYDI: u texnik boʻlishi mumkin
    // ("Cannot read properties of undefined") va faqat oʻzbekcha.
    // Bu kod avval jadvalda yoʻq edi va aynan shu holat yuz berardi
    'INTERNAL_ERROR' => l10n.errInternal,

    // Noma'lum kod — SERVERNING MATNI (zaxira).
    //
    // U faqat oʻzbekcha, lekin boʻsh ekrandan yaxshiroq: yangi kod
    // qoʻshilgan va bu jadvalga koʻchirilmagan holatda foydalanuvchi
    // hech boʻlmasa nima boʻlganini biladi.
    _ => error.message,
  };
}

String _cooldownMessage(AppLocalizations l10n, ApiException error) {
  final seconds = error.retryAfterSeconds;
  return seconds == null
      ? l10n.errOtpCooldownWait
      : l10n.errOtpCooldownSeconds(seconds);
}

String _attemptsMessage(AppLocalizations l10n, ApiException error) {
  final left = error.details?['attemptsLeft'];
  // Server sonni satr sifatida ham yuborishi mumkin — ikkalasini ham
  // qabul qilamiz, aks holda matn "Qolgan urinishlar: null" boʻlardi
  final attempts = left is int ? left : int.tryParse('$left');
  return attempts == null
      ? l10n.errOtpIncorrect
      : l10n.errOtpIncorrectAttempts(attempts);
}

String _validationMessage(AppLocalizations l10n, ApiException error) {
  final fields = error.details?['fields'];
  if (fields is List && fields.isNotEmpty) {
    // Backend maydon xatolarini inglizcha qaytaradi ("phone must be...").
    // Ularni koʻrsatmaymiz — umumiy matn tushunarliroq.
    return l10n.errValidationFields;
  }
  return l10n.errValidation;
}

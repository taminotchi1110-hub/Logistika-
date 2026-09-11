import 'package:karvon/l10n/app_localizations.dart';

import '../domain/load.dart';

/// Yuk bilan bog'liq yorliqlar — joriy tilda.
///
/// Domen (`LoadStatus`) tilni bilmaydi: u API qiymatlari bilan ishlaydi.
/// Yorliq faqat interfeysda kerak, shuning uchun tarjima shu yerda.
extension LoadStatusL10n on LoadStatus {
  String localized(AppLocalizations l10n) => switch (this) {
        LoadStatus.draft => l10n.loadStatusDraft,
        LoadStatus.published => l10n.loadStatusPublished,
        LoadStatus.matching => l10n.loadStatusMatching,
        LoadStatus.offersReceived => l10n.loadStatusOffersReceived,
        LoadStatus.assigned => l10n.loadStatusAssigned,
        LoadStatus.inProgress => l10n.loadStatusInProgress,
        LoadStatus.completed => l10n.loadStatusCompleted,
        LoadStatus.cancelled => l10n.loadStatusCancelled,
        LoadStatus.expired => l10n.loadStatusExpired,
      };
}

/// Moslik sababini tarjima qiladi.
///
/// SERVER KOD YUBORADI, MATN EMAS: `"NEAR_PICKUP:12"`, `"REGULAR_ROUTE"`.
/// Avval server tayyor o'zbekcha jumla yuborardi ("Sizga 12 km") va
/// ruscha interfeysda o'zbekcha matn chiqardi — xato kodlaridagi
/// muammoning aynan o'zi.
///
/// NOMA'LUM QIYMAT O'ZGARMAY QAYTADI: eski server versiyasi hali
/// matn yuborishi mumkin (yangilash bosqichma-bosqich boradi) va
/// bo'sh joydan o'zbekcha matn yaxshiroq.
String localizeMatchReason(AppLocalizations l10n, String raw) {
  final separator = raw.indexOf(':');
  final code = separator == -1 ? raw : raw.substring(0, separator);
  final param = separator == -1 ? '' : raw.substring(separator + 1);

  return switch (code) {
    'NEAR_PICKUP' when param.isNotEmpty => l10n.reasonNearPickup(param),
    'REGULAR_ROUTE' => l10n.reasonRegularRoute,
    'ROUTE_MATCH' => l10n.reasonRouteMatch,
    'CAPACITY_FIT' => l10n.reasonCapacityFit,
    'HIGH_RATING' when param.isNotEmpty => l10n.reasonHighRating(param),
    'PREMIUM' => l10n.reasonPremium,
    _ => raw,
  };
}

import 'package:flutter/widgets.dart';
import 'package:karvon/l10n/app_localizations.dart';

import '../../features/auth/domain/user.dart';
import '../utils/money.dart';

/// Tarjimali formatlash — ekranlar uchun yagona kirish nuqtasi.
///
/// `money.dart` sof funksiyalar va Flutter'ga bog'liq emas. Bu fayl
/// ularni joriy til birliklari bilan chaqiradi: ekranda
/// `formatSoum(x)` o'rniga `context.soum(x)`.
///
/// NEGA KENGAYTMA: 46 ta chaqiruv joyi bor. Har birida
/// `units: AppLocalizations.of(context).units` yozish shovqin va
/// bittasi unutilsa, o'sha joyda o'zbekcha birlik qolib ketadi.
extension LocalizedUnits on AppLocalizations {
  UnitLabels get units => UnitLabels(
        soum: unitSoum,
        thousand: unitThousand,
        million: unitMillion,
        ton: unitTon,
        kg: unitKg,
        km: unitKm,
        meter: unitMeter,
        hour: unitHour,
        minute: unitMinute,
      );
}

extension LocalizedFormat on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);

  String soum(Object? tiyin, {bool withSuffix = true, bool withTiyin = false}) =>
      formatSoum(tiyin, withSuffix: withSuffix, withTiyin: withTiyin, units: l10n.units);

  String soumShort(Object? tiyin) => formatSoumShort(tiyin, units: l10n.units);

  String weight(int kg) => formatWeight(kg, units: l10n.units);

  String distance(num? km) => formatDistance(km, units: l10n.units);

  String duration(int? minutes) => formatDuration(minutes, units: l10n.units);
}

/// Rol nomi — joriy tilda.
///
/// Domen enumi (`UserRole`) tilni bilmaydi va bilmasligi kerak: u API
/// bilan ishlaydi. Yorliq faqat interfeysda kerak, shuning uchun
/// tarjima shu yerda.
extension UserRoleL10n on UserRole {
  String localized(AppLocalizations l10n) => switch (this) {
        UserRole.shipper => l10n.roleShipper,
        UserRole.driver => l10n.roleDriver,
        UserRole.both => l10n.roleBoth,
      };
}

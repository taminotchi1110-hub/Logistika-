import 'package:karvon/l10n/app_localizations.dart';

import '../domain/driver_readiness.dart';

/// Haydovchi profili yorliqlari — joriy tilda.
extension ReadinessStepL10n on ReadinessStep {
  String localized(AppLocalizations l10n) => switch (this) {
        ReadinessStep.profile => l10n.readinessProfile,
        ReadinessStep.identityDocument => l10n.readinessIdentity,
        ReadinessStep.driverLicense => l10n.readinessLicense,
        ReadinessStep.verifiedVehicle => l10n.readinessVehicle,
        ReadinessStep.routes => l10n.readinessRoutes,
        ReadinessStep.other => l10n.readinessOther,
      };

  /// NEGA kerakligi — quruq talab qarshilik uyg'otadi.
  String why(AppLocalizations l10n) => switch (this) {
        ReadinessStep.profile => l10n.readinessProfileWhy,
        ReadinessStep.identityDocument => l10n.readinessIdentityWhy,
        ReadinessStep.driverLicense => l10n.readinessLicenseWhy,
        ReadinessStep.verifiedVehicle => l10n.readinessVehicleWhy,
        ReadinessStep.routes => l10n.readinessRoutesWhy,
        ReadinessStep.other => '',
      };
}

extension DriverRouteL10n on DriverRoute {
  /// "Toshkent shahri → Samarqand".
  ///
  /// Server viloyat nomini o'zbekcha beradi. `regionName` berilsa nom
  /// spravochnikdan joriy tilda olinadi; spravochnik hali yuklanmagan
  /// bo'lsa — server nomi (bo'sh joydan yaxshiroq).
  String localizedLabel(AppLocalizations l10n, {String? Function(int regionId)? regionName}) {
    final from = regionName?.call(fromRegionId) ?? fromRegionName;
    final toId = toRegionId;
    final to = toId == null
        ? l10n.routeAnyDestination
        : regionName?.call(toId) ?? toRegionName ?? '';
    return '$from → $to';
  }
}

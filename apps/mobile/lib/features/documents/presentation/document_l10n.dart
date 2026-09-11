import 'package:karvon/l10n/app_localizations.dart';

import '../domain/document.dart';

/// Hujjat yorliqlari — joriy tilda.
extension DocumentTypeL10n on DocumentType {
  String localized(AppLocalizations l10n) => switch (this) {
        DocumentType.passport => l10n.docPassport,
        DocumentType.idCard => l10n.docIdCard,
        DocumentType.driverLicense => l10n.docDriverLicense,
        DocumentType.vehicleReg => l10n.docVehicleReg,
        DocumentType.insurance => l10n.docInsurance,
        DocumentType.other => l10n.docOther,
      };
}

extension UserDocumentL10n on UserDocument {
  /// Hujjatning qaysi tomoni; bir tomonli hujjatda bo'sh satr.
  String sideText(AppLocalizations l10n) => switch (pageSide) {
        'FRONT' => l10n.sideFront,
        'BACK' => l10n.sideBack,
        _ => '',
      };
}

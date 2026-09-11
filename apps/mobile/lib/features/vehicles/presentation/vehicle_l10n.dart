import 'package:karvon/l10n/app_localizations.dart';

import '../domain/vehicle.dart';

/// Tekshiruv holati — joriy tilda.
///
/// Nom domen enumida emas, shu yerda: domen API bilan ishlaydi va
/// tilni bilmaydi. Transport va hujjatlar bir xil to'rt holatdan o'tadi.
extension VerificationStatusL10n on VerificationStatus {
  String localized(AppLocalizations l10n) => switch (this) {
        VerificationStatus.notSubmitted => l10n.verificationNotSubmitted,
        VerificationStatus.pending => l10n.verificationPending,
        VerificationStatus.verified => l10n.verificationVerified,
        VerificationStatus.rejected => l10n.verificationRejected,
      };
}

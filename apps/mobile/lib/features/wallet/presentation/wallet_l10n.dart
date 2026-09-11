import 'package:karvon/l10n/app_localizations.dart';

import '../domain/wallet.dart';

/// Hamyon yorliqlari — joriy tilda.
extension LedgerEntryTypeL10n on LedgerEntryType {
  String localized(AppLocalizations l10n) => switch (this) {
        LedgerEntryType.topup => l10n.ledgerTopup,
        LedgerEntryType.escrowHold => l10n.ledgerEscrowHold,
        LedgerEntryType.escrowRelease => l10n.ledgerEscrowRelease,
        LedgerEntryType.escrowRefund => l10n.ledgerEscrowRefund,
        LedgerEntryType.commission => l10n.ledgerCommission,
        LedgerEntryType.payout => l10n.ledgerPayout,
        LedgerEntryType.payoutReversal => l10n.ledgerPayoutReversal,
        LedgerEntryType.penalty => l10n.ledgerPenalty,
        LedgerEntryType.bonus => l10n.ledgerBonus,
        LedgerEntryType.subscription => l10n.ledgerSubscription,
        LedgerEntryType.adjustment => l10n.ledgerAdjustment,
        LedgerEntryType.other => l10n.ledgerOther,
      };
}

extension LedgerEntryTitle on LedgerEntry {
  /// Harakat nomi.
  ///
  /// Server `description` ni hozircha o'zbekcha yozadi va u ko'pincha
  /// turning o'zini takrorlaydi — shuning uchun nom TURDAN, joriy tilda
  /// olinadi. Istisno: administrator tuzatishi va noma'lum tur — ularda
  /// nima bo'lganini faqat izoh aytadi ("Nizo №195 bo'yicha qaytarildi").
  String title(AppLocalizations l10n) {
    final explainedOnlyByNote =
        type == LedgerEntryType.adjustment || type == LedgerEntryType.other;
    return explainedOnlyByNote && description.isNotEmpty ? description : type.localized(l10n);
  }
}

extension PayoutStatusText on Payout {
  /// Noma'lum holat o'zi ko'rsatiladi — yashirishdan ko'ra yaxshiroq.
  String statusText(AppLocalizations l10n) => switch (status) {
        'REQUESTED' => l10n.payoutRequested,
        'PROCESSING' => l10n.payoutProcessing,
        'COMPLETED' || 'PAID' => l10n.payoutCompleted,
        'FAILED' => l10n.payoutFailed,
        'REJECTED' => l10n.payoutRejected,
        _ => status,
      };
}

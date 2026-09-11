import 'package:karvon/l10n/app_localizations.dart';

import '../domain/order.dart';

/// Buyurtma yorliqlari — joriy tilda.
///
/// Domen enumi (`OrderStatus`) API bilan ishlaydi va tilni bilmaydi.
/// Server ham `statusLabel` yuboradi, lekin u hozircha doim o'zbekcha —
/// shuning uchun ilova TANIGAN statusni o'zi tarjima qiladi, server
/// matni esa faqat yangi (ilova bilmaydigan) status uchun zaxira.
extension OrderStatusL10n on OrderStatus {
  /// Sarlavha va vaqt chizig'idagi holat nomi.
  String localized(AppLocalizations l10n) => switch (this) {
        OrderStatus.assigned => l10n.orderStatusAssigned,
        OrderStatus.confirmed => l10n.orderStatusConfirmed,
        OrderStatus.enRouteToPickup => l10n.orderStatusEnRouteToPickup,
        OrderStatus.arrivedAtPickup => l10n.orderStatusArrivedAtPickup,
        OrderStatus.loaded => l10n.orderStatusLoaded,
        OrderStatus.inTransit => l10n.orderStatusInTransit,
        OrderStatus.arrivedAtDelivery => l10n.orderStatusArrivedAtDelivery,
        OrderStatus.delivered => l10n.orderStatusDelivered,
        OrderStatus.completed => l10n.orderStatusCompleted,
        OrderStatus.closed => l10n.orderStatusClosed,
        OrderStatus.disputed => l10n.orderStatusDisputed,
        OrderStatus.cancelledByShipper => l10n.orderStatusCancelledByShipper,
        OrderStatus.cancelledByDriver => l10n.orderStatusCancelledByDriver,
        OrderStatus.cancelledByAdmin => l10n.orderStatusCancelledByAdmin,
      };

  /// TUGMA matni — statusning o'zining nomi EMAS.
  ///
  /// Status "Yuk ortildi" deb o'qiladi, lekin tugmada "Yukni ortdim"
  /// yozilishi kerak: foydalanuvchi o'zi bajaradigan ishni buyruq
  /// shaklida ko'radi.
  String action(AppLocalizations l10n) => switch (this) {
        OrderStatus.assigned => l10n.orderActionAccept,
        OrderStatus.confirmed => l10n.orderActionConfirm,
        OrderStatus.enRouteToPickup => l10n.orderActionStartToPickup,
        OrderStatus.arrivedAtPickup => l10n.orderActionArrivedAtPickup,
        OrderStatus.loaded => l10n.orderActionLoaded,
        OrderStatus.inTransit => l10n.orderActionStartTransit,
        OrderStatus.arrivedAtDelivery => l10n.orderActionArrivedAtDelivery,
        OrderStatus.delivered => l10n.orderActionDelivered,
        OrderStatus.completed => l10n.orderActionCompleted,
        OrderStatus.closed => l10n.orderActionClose,
        OrderStatus.disputed => l10n.orderActionDispute,
        OrderStatus.cancelledByShipper ||
        OrderStatus.cancelledByDriver ||
        OrderStatus.cancelledByAdmin =>
          l10n.orderActionCancel,
      };
}

extension OrderStatusText on Order {
  /// Tanilmagan (yangi) statusda server matni: "Haydovchi tanlandi" deb
  /// yolg'on aytgandan ko'ra o'zbekcha bo'lsa ham to'g'ri matn yaxshiroq.
  String statusText(AppLocalizations l10n) =>
      hasKnownStatus ? status.localized(l10n) : statusLabel;
}

extension OrderHistoryEntryText on OrderHistoryEntry {
  String statusText(AppLocalizations l10n) =>
      hasKnownStatus ? status.localized(l10n) : statusLabel;
}

/// To'lov usuli izohi — buyurtma tafsilotidagi moliya bloki uchun.
///
/// ESCROW alohida tushuntiriladi: bu platformaning asosiy himoyasi,
/// lekin nomi foydalanuvchiga hech narsa demaydi.
String paymentMethodNote(AppLocalizations l10n, String method) => switch (method) {
      'ESCROW' => l10n.paymentEscrowNote,
      'CASH' => l10n.paymentCashNote,
      'CARD' => l10n.paymentCardNote,
      'BANK_TRANSFER' => l10n.paymentBankNote,
      _ => l10n.paymentUnknownNote,
    };

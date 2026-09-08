import '../../../core/theme/app_colors.dart';
import 'package:flutter/material.dart' show Color, IconData, Icons;

/// Buyurtma holati — backend'dagi `order_status` bilan AYNAN bir xil.
///
/// DIQQAT: o'tish qoidalari bu yerda TAKRORLANMAYDI. Server har bir
/// javobda `nextAllowed` ro'yxatini beradi va ilova tugmalarni o'shandan
/// chizadi. Aks holda ikkita state machine paydo bo'ladi va ular
/// muqarrar ravishda bir-biridan uzoqlashadi: ilovada tugma faol,
/// server esa 409 qaytaradi.
enum OrderStatus {
  assigned('ASSIGNED'),
  confirmed('CONFIRMED'),
  enRouteToPickup('EN_ROUTE_TO_PICKUP'),
  arrivedAtPickup('ARRIVED_AT_PICKUP'),
  loaded('LOADED'),
  inTransit('IN_TRANSIT'),
  arrivedAtDelivery('ARRIVED_AT_DELIVERY'),
  delivered('DELIVERED'),
  completed('COMPLETED'),
  closed('CLOSED'),
  disputed('DISPUTED'),
  cancelledByShipper('CANCELLED_BY_SHIPPER'),
  cancelledByDriver('CANCELLED_BY_DRIVER'),
  cancelledByAdmin('CANCELLED_BY_ADMIN');

  const OrderStatus(this.apiValue);

  final String apiValue;

  static OrderStatus fromApi(String? value) {
    for (final status in OrderStatus.values) {
      if (status.apiValue == value) return status;
    }
    // Server yangi status qo'shsa ilova qulab tushmasligi kerak
    return OrderStatus.assigned;
  }

  /// Reys hali davom etyaptimi.
  bool get isActive => switch (this) {
        OrderStatus.assigned ||
        OrderStatus.confirmed ||
        OrderStatus.enRouteToPickup ||
        OrderStatus.arrivedAtPickup ||
        OrderStatus.loaded ||
        OrderStatus.inTransit ||
        OrderStatus.arrivedAtDelivery ||
        OrderStatus.delivered ||
        OrderStatus.disputed =>
          true,
        _ => false,
      };

  bool get isCancelled => switch (this) {
        OrderStatus.cancelledByShipper ||
        OrderStatus.cancelledByDriver ||
        OrderStatus.cancelledByAdmin =>
          true,
        _ => false,
      };

  /// Bekor qilish o'tishimi — tugma qizil bo'lishi va tasdiq so'rashi kerak.
  bool get isCancellation => isCancelled;

  /// Xaritada jonli kuzatuv ishlaydigan holatlar.
  ///
  /// Backend'dagi `TRACKING_STATUSES` bilan bir xil: GPS faqat reys
  /// davomida yoziladi. Ilova bu ro'yxatga qarab xarita ko'rsatadi —
  /// bo'sh xarita "kuzatuv ishlamayapti" degan taassurot qoldiradi.
  bool get isTracking => switch (this) {
        OrderStatus.enRouteToPickup ||
        OrderStatus.arrivedAtPickup ||
        OrderStatus.loaded ||
        OrderStatus.inTransit ||
        OrderStatus.arrivedAtDelivery =>
          true,
        _ => false,
      };

  /// Vaqt chizig'idagi tartib raqami (0 — chiziqda ko'rinmaydi).
  ///
  /// Bekor qilish va nizo asosiy chiziqdan tashqarida: ular alohida
  /// ko'rsatiladi, aks holda chiziq shoxlanib ketadi.
  int get step => switch (this) {
        OrderStatus.assigned => 1,
        OrderStatus.confirmed => 2,
        OrderStatus.enRouteToPickup => 3,
        OrderStatus.arrivedAtPickup => 4,
        OrderStatus.loaded => 5,
        OrderStatus.inTransit => 6,
        OrderStatus.arrivedAtDelivery => 7,
        OrderStatus.delivered => 8,
        OrderStatus.completed => 9,
        OrderStatus.closed => 10,
        _ => 0,
      };

  /// TUGMA matni — statusning o'zining nomi EMAS.
  ///
  /// Status "Yuk ortildi" deb o'qiladi, lekin tugmada "Yukni ortdim"
  /// yozilishi kerak: foydalanuvchi o'zi bajaradigan ishni buyruq
  /// shaklida ko'radi.
  String get actionLabel => switch (this) {
        OrderStatus.confirmed => 'Tasdiqlayman',
        OrderStatus.enRouteToPickup => 'Yoʻlga chiqdim',
        OrderStatus.arrivedAtPickup => 'Yetib keldim',
        OrderStatus.loaded => 'Yukni ortdim',
        OrderStatus.inTransit => 'Yoʻlga chiqdim',
        OrderStatus.arrivedAtDelivery => 'Manzilga yetdim',
        OrderStatus.delivered => 'Yukni topshirdim',
        OrderStatus.completed => 'Qabul qildim',
        OrderStatus.closed => 'Yopish',
        OrderStatus.disputed => 'Nizo ochish',
        OrderStatus.cancelledByShipper ||
        OrderStatus.cancelledByDriver ||
        OrderStatus.cancelledByAdmin =>
          'Bekor qilish',
        OrderStatus.assigned => 'Qabul qilish',
      };

  /// Vaqt chizig'idagi qadam nomi.
  String get label => switch (this) {
        OrderStatus.assigned => 'Haydovchi tanlandi',
        OrderStatus.confirmed => 'Buyurtma tasdiqlandi',
        OrderStatus.enRouteToPickup => 'Haydovchi yoʻlga chiqdi',
        OrderStatus.arrivedAtPickup => 'Yuk olish nuqtasida',
        OrderStatus.loaded => 'Yuk ortildi',
        OrderStatus.inTransit => 'Yoʻlda',
        OrderStatus.arrivedAtDelivery => 'Manzilga yaqinlashdi',
        OrderStatus.delivered => 'Yetkazib berildi',
        OrderStatus.completed => 'Tasdiqlandi',
        OrderStatus.closed => 'Yopildi',
        OrderStatus.disputed => 'Nizo',
        OrderStatus.cancelledByShipper => 'Yuk beruvchi bekor qildi',
        OrderStatus.cancelledByDriver => 'Haydovchi bekor qildi',
        OrderStatus.cancelledByAdmin => 'Administrator bekor qildi',
      };

  IconData get icon => switch (this) {
        OrderStatus.assigned => Icons.handshake_outlined,
        OrderStatus.confirmed => Icons.check_circle_outline_rounded,
        OrderStatus.enRouteToPickup => Icons.directions_car_rounded,
        OrderStatus.arrivedAtPickup => Icons.location_on_rounded,
        OrderStatus.loaded => Icons.inventory_rounded,
        OrderStatus.inTransit => Icons.local_shipping_rounded,
        OrderStatus.arrivedAtDelivery => Icons.flag_rounded,
        OrderStatus.delivered => Icons.assignment_turned_in_rounded,
        OrderStatus.completed => Icons.verified_rounded,
        OrderStatus.closed => Icons.lock_rounded,
        OrderStatus.disputed => Icons.gavel_rounded,
        _ => Icons.cancel_rounded,
      };

  Color get color => switch (this) {
        OrderStatus.assigned => AppColors.statusAssigned,
        OrderStatus.confirmed => AppColors.statusConfirmed,
        OrderStatus.enRouteToPickup || OrderStatus.arrivedAtPickup =>
          AppColors.statusEnRoute,
        OrderStatus.loaded => AppColors.statusLoaded,
        OrderStatus.inTransit || OrderStatus.arrivedAtDelivery =>
          AppColors.statusInTransit,
        OrderStatus.delivered || OrderStatus.completed || OrderStatus.closed =>
          AppColors.statusDelivered,
        OrderStatus.disputed => AppColors.warning,
        _ => AppColors.statusCancelled,
      };
}

/// Kontakt ko'rinishi qoidalari — serverdan keladi, ilova hisoblamaydi.
///
/// Bu loyihaning eng muhim biznes qoidasi: haydovchi va mijoz
/// bir-birining raqamini faqat haydovchi yuk olish nuqtasiga
/// yetib borgach ko'radi. Qoidani ilovada takrorlash — uni
/// chetlab o'tish yo'lini ochish demak.
class ContactVisibility {
  const ContactVisibility({
    required this.pickupPhone,
    required this.deliveryPhone,
    required this.counterpartyPhone,
    required this.chatEnabled,
    required this.chatReadOnly,
    required this.emergencyRevealAvailable,
  });

  factory ContactVisibility.fromJson(Map<String, dynamic>? json) {
    final data = json ?? const <String, dynamic>{};
    return ContactVisibility(
      pickupPhone: data['pickupPhone'] as bool? ?? false,
      deliveryPhone: data['deliveryPhone'] as bool? ?? false,
      counterpartyPhone: data['counterpartyPhone'] as bool? ?? false,
      chatEnabled: data['chatEnabled'] as bool? ?? false,
      chatReadOnly: data['chatReadOnly'] as bool? ?? false,
      emergencyRevealAvailable: data['emergencyRevealAvailable'] as bool? ?? false,
    );
  }

  final bool pickupPhone;
  final bool deliveryPhone;
  final bool counterpartyPhone;
  final bool chatEnabled;
  final bool chatReadOnly;
  final bool emergencyRevealAvailable;
}

class OrderParty {
  const OrderParty({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.ratingAvg,
    required this.ratingCount,
    required this.role,
  });

  factory OrderParty.fromJson(Map<String, dynamic> json) => OrderParty(
        id: json['id'] as String? ?? '',
        firstName: json['firstName'] as String?,
        lastName: json['lastName'] as String?,
        // Yopiq bo'lsa maskalangan holda keladi: "+998 90 *** ** 67"
        phone: json['phone'] as String? ?? '',
        ratingAvg: (json['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
        role: json['role'] as String? ?? '',
      );

  final String id;
  final String? firstName;
  final String? lastName;
  final String phone;
  final double ratingAvg;
  final int ratingCount;
  final String role;

  String get fullName {
    final name = [firstName, lastName].where((part) => part != null && part.isNotEmpty).join(' ');
    return name.isEmpty ? 'Foydalanuvchi' : name;
  }

  String get initials {
    final first = (firstName ?? '').trim();
    final last = (lastName ?? '').trim();
    if (first.isEmpty && last.isEmpty) return '?';
    return '${first.isEmpty ? '' : first[0]}${last.isEmpty ? '' : last[0]}'.toUpperCase();
  }

  bool get hasRating => ratingCount > 0;
  bool get isDriver => role == 'DRIVER';
}

class OrderVehicle {
  const OrderVehicle({
    required this.id,
    required this.brand,
    required this.model,
    required this.plateNumber,
  });

  factory OrderVehicle.fromJson(Map<String, dynamic> json) => OrderVehicle(
        id: json['id'] as String? ?? '',
        brand: json['brand'] as String? ?? '',
        model: json['model'] as String? ?? '',
        plateNumber: json['plateNumber'] as String? ?? '',
      );

  final String id;
  final String brand;
  final String model;
  final String plateNumber;

  String get title => '$brand $model'.trim();

  /// `01A123BC` → `01 A 123 BC` — o'qish osonroq.
  String get plateFormatted {
    final plate = plateNumber.replaceAll(' ', '');
    if (plate.length < 8) return plateNumber;
    return '${plate.substring(0, 2)} ${plate.substring(2, 3)} '
        '${plate.substring(3, 6)} ${plate.substring(6)}';
  }
}

class OrderLoad {
  const OrderLoad({
    required this.id,
    required this.title,
    required this.weightKg,
    required this.pickupAddress,
    required this.pickupLat,
    required this.pickupLng,
    required this.deliveryAddress,
    required this.deliveryLat,
    required this.deliveryLng,
    this.pickupContactName,
    this.pickupContactPhone,
    this.deliveryContactName,
    this.deliveryContactPhone,
    this.distanceKm,
    this.durationMin,
  });

  factory OrderLoad.fromJson(Map<String, dynamic> json) => OrderLoad(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        weightKg: (json['weightKg'] as num?)?.toInt() ?? 0,
        pickupAddress: json['pickupAddress'] as String? ?? '',
        pickupLat: (json['pickupLat'] as num?)?.toDouble() ?? 0,
        pickupLng: (json['pickupLng'] as num?)?.toDouble() ?? 0,
        pickupContactName: json['pickupContactName'] as String?,
        pickupContactPhone: json['pickupContactPhone'] as String?,
        deliveryAddress: json['deliveryAddress'] as String? ?? '',
        deliveryLat: (json['deliveryLat'] as num?)?.toDouble() ?? 0,
        deliveryLng: (json['deliveryLng'] as num?)?.toDouble() ?? 0,
        deliveryContactName: json['deliveryContactName'] as String?,
        deliveryContactPhone: json['deliveryContactPhone'] as String?,
        distanceKm: (json['distanceKm'] as num?)?.toDouble(),
        durationMin: (json['durationMin'] as num?)?.toInt(),
      );

  final String id;
  final String title;
  final int weightKg;
  final String pickupAddress;
  final double pickupLat;
  final double pickupLng;
  final String? pickupContactName;
  final String? pickupContactPhone;
  final String deliveryAddress;
  final double deliveryLat;
  final double deliveryLng;
  final String? deliveryContactName;
  final String? deliveryContactPhone;
  final double? distanceKm;
  final int? durationMin;

  String get pickupShort => pickupAddress.split(',').first.trim();
  String get deliveryShort => deliveryAddress.split(',').first.trim();
}

class Order {
  const Order({
    required this.id,
    required this.publicNo,
    required this.status,
    required this.statusLabel,
    required this.nextAllowed,
    required this.priceTiyin,
    required this.commissionTiyin,
    required this.driverPayoutTiyin,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.load,
    required this.counterparty,
    required this.visibility,
    required this.createdAt,
    this.vehicle,
    this.conversationId,
    this.confirmedAt,
    this.deliveredAt,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'] as String? ?? '',
      publicNo: json['publicNo']?.toString() ?? '',
      status: OrderStatus.fromApi(json['status'] as String?),
      // Server tarjimasi ustuvor: statuslar ro'yxati o'zgarsa ilovani
      // yangilash shart bo'lmaydi
      statusLabel: json['statusLabel'] as String? ??
          OrderStatus.fromApi(json['status'] as String?).label,
      nextAllowed: (json['nextAllowed'] as List<dynamic>? ?? const [])
          .map((item) => OrderStatus.fromApi(item as String?))
          .toList(),
      priceTiyin: json['priceTiyin']?.toString() ?? '0',
      commissionTiyin: json['commissionTiyin']?.toString() ?? '0',
      driverPayoutTiyin: json['driverPayoutTiyin']?.toString() ?? '0',
      paymentMethod: json['paymentMethod'] as String? ?? 'CASH',
      paymentStatus: json['paymentStatus'] as String? ?? '',
      load: OrderLoad.fromJson(json['load'] as Map<String, dynamic>? ?? const {}),
      counterparty:
          OrderParty.fromJson(json['counterparty'] as Map<String, dynamic>? ?? const {}),
      vehicle: json['vehicle'] == null
          ? null
          : OrderVehicle.fromJson(json['vehicle'] as Map<String, dynamic>),
      visibility: ContactVisibility.fromJson(json['visibility'] as Map<String, dynamic>?),
      conversationId: json['conversationId'] as String?,
      confirmedAt: DateTime.tryParse('${json['confirmedAt']}'),
      deliveredAt: DateTime.tryParse('${json['deliveredAt']}'),
      createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
    );
  }

  final String id;
  final String publicNo;
  final OrderStatus status;
  final String statusLabel;

  /// Serverdan kelgan ruxsat etilgan keyingi holatlar.
  final List<OrderStatus> nextAllowed;

  /// Pul TIYINDA va SATR sifatida — `double` aniqlikni yo'qotadi.
  final String priceTiyin;
  final String commissionTiyin;
  final String driverPayoutTiyin;
  final String paymentMethod;
  final String paymentStatus;

  final OrderLoad load;
  final OrderParty counterparty;
  final OrderVehicle? vehicle;
  final ContactVisibility visibility;
  final String? conversationId;
  final DateTime? confirmedAt;
  final DateTime? deliveredAt;
  final DateTime createdAt;

  bool get isEscrow => paymentMethod == 'ESCROW';
  bool get isPaid => paymentStatus == 'PAID' || paymentStatus == 'RELEASED';

  /// Foydalanuvchi bajara oladigan oldinga siljish o'tishlari.
  ///
  /// Bekor qilish alohida ajratiladi: u ro'yxatda oxirgi va boshqa
  /// rangda ko'rsatilishi kerak, aks holda tasodifan bosiladi.
  List<OrderStatus> get forwardTransitions =>
      nextAllowed.where((status) => !status.isCancellation).toList();

  List<OrderStatus> get cancelTransitions =>
      nextAllowed.where((status) => status.isCancellation).toList();
}

/// Vaqt chizig'ining bitta qadami.
class OrderHistoryEntry {
  const OrderHistoryEntry({
    required this.status,
    required this.statusLabel,
    required this.at,
    this.fromStatus,
    this.actorRole,
    this.actorName,
    this.note,
    this.lat,
    this.lng,
  });

  factory OrderHistoryEntry.fromJson(Map<String, dynamic> json) => OrderHistoryEntry(
        status: OrderStatus.fromApi(json['status'] as String?),
        statusLabel: json['statusLabel'] as String? ?? '',
        at: DateTime.tryParse('${json['at']}') ?? DateTime.now(),
        fromStatus: json['fromStatus'] == null
            ? null
            : OrderStatus.fromApi(json['fromStatus'] as String?),
        actorRole: json['actorRole'] as String?,
        actorName: json['actorName'] as String?,
        note: json['note'] as String?,
        lat: (json['lat'] as num?)?.toDouble(),
        lng: (json['lng'] as num?)?.toDouble(),
      );

  final OrderStatus status;
  final String statusLabel;
  final DateTime at;
  final OrderStatus? fromStatus;
  final String? actorRole;
  final String? actorName;
  final String? note;

  /// Statusni qayerda bosgani — nizoda asosiy dalil.
  final double? lat;
  final double? lng;

  bool get hasLocation => lat != null && lng != null;
}

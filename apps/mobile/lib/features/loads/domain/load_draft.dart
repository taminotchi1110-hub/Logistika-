import '../../geo/domain/place.dart';

/// Yuk e'loni qoralamasi — forma to'ldirilayotgandagi holat.
///
/// NEGA ALOHIDA MODEL (to'g'ridan-to'g'ri `Map` emas): forma uch
/// bosqichdan iborat va har bosqichda "keyingi" tugmasi FAOL bo'lishi
/// kerakmi degan savolga javob berish kerak. Buni `Map` ustida
/// yozish — har joyda kalit nomini qayta yozish va xato qilish demak.
///
/// Model o'zgarmas (immutable): `copyWith` orqali yangilanadi va
/// holat boshqaruvi bilan tabiiy ishlaydi.
class LoadDraft {
  const LoadDraft({
    this.title = '',
    this.description = '',
    this.categoryId,
    this.weightKg,
    this.volumeM3,
    this.packagesCount,
    this.packageType,
    this.isFragile = false,
    this.tempMinC,
    this.tempMaxC,
    this.pickup,
    this.pickupContactName = '',
    this.pickupContactPhone = '',
    this.delivery,
    this.deliveryContactName = '',
    this.deliveryContactPhone = '',
    this.pickupFrom,
    this.pickupTo,
    this.deliveryBy,
    this.vehicleTypeIds = const [],
    this.bodyTypeIds = const [],
    this.specialRequirementIds = const [],
    this.priceTiyin,
    this.isNegotiable = false,
    this.paymentMethod = 'CASH',
  });

  // --- 1-bosqich: yuk ---
  final String title;
  final String description;
  final int? categoryId;
  final int? weightKg;
  final double? volumeM3;
  final int? packagesCount;
  final String? packageType;
  final bool isFragile;
  final int? tempMinC;
  final int? tempMaxC;

  // --- 2-bosqich: manzil va vaqt ---
  final Place? pickup;
  final String pickupContactName;
  final String pickupContactPhone;
  final Place? delivery;
  final String deliveryContactName;
  final String deliveryContactPhone;
  final DateTime? pickupFrom;
  final DateTime? pickupTo;
  final DateTime? deliveryBy;

  // --- 3-bosqich: talab va narx ---
  final List<int> vehicleTypeIds;
  final List<int> bodyTypeIds;
  final List<int> specialRequirementIds;
  final BigInt? priceTiyin;
  final bool isNegotiable;
  final String paymentMethod;

  /// 1-bosqich to'liqmi.
  ///
  /// Sarlavha 3 belgidan qisqa bo'lsa server rad etadi — shu qoida
  /// mijoz tomonda ham takrorlanadi, aks holda foydalanuvchi butun
  /// formani to'ldirib bo'lgach xato oladi.
  bool get isCargoValid =>
      title.trim().length >= 3 &&
      categoryId != null &&
      weightKg != null &&
      weightKg! > 0 &&
      weightKg! <= 60000;

  bool get isRouteValid =>
      pickup != null &&
      delivery != null &&
      pickupFrom != null &&
      pickupTo != null &&
      !pickupTo!.isBefore(pickupFrom!) &&
      // Yetkazish muddati yuklashdan oldin bo'lishi mumkin emas
      (deliveryBy == null || !deliveryBy!.isBefore(pickupFrom!));

  /// Narx ixtiyoriy: "kelishuv asosida" e'lon ham to'liq hisoblanadi.
  ///
  /// 1000 so'mdan past narx haqiqiy emas — bunday e'lon xato yozilgan.
  bool get isPriceValid =>
      priceTiyin == null || priceTiyin! >= BigInt.from(100000);

  /// E'lon kelishuv asosida chiqadimi.
  ///
  /// NARXSIZ E'LON HAR DOIM KELISHUV ASOSIDA: backend ikkalasidan
  /// birini talab qiladi (`LOAD_PRICE_REQUIRED`) va narx bo'lmasa
  /// haydovchi nimaga tayanishini bilmaydi. Shuning uchun bu qoida
  /// forma darajasida emas, MODEL darajasida hal qilinadi — hech bir
  /// ekran uni unutib qo'ya olmaydi.
  bool get isNegotiableEffective => isNegotiable || priceTiyin == null;

  bool get isComplete => isCargoValid && isRouteValid && isPriceValid;

  /// Harorat maydonlari kerakmi — refrijerator kuzov tanlanganda.
  bool get hasTemperature => tempMinC != null || tempMaxC != null;

  /// Serverga yuboriladigan shakl.
  ///
  /// `null` maydonlar UMUMAN yuborilmaydi: backend'da `whitelist:true`
  /// va `null` qiymat validatorga tushib xato berishi mumkin.
  /// Bo'sh matnlar ham tashlanadi — bo'sh kontakt nomi saqlashning
  /// ma'nosi yo'q.
  Map<String, dynamic> toCreateBody({required bool publishNow}) {
    Map<String, dynamic> point(Place place, String name, String phone) => {
          'address': place.label,
          'lat': place.lat,
          'lng': place.lng,
          if (name.trim().isNotEmpty) 'contactName': name.trim(),
          if (phone.trim().isNotEmpty) 'contactPhone': phone.trim(),
        };

    return {
      'title': title.trim(),
      if (description.trim().isNotEmpty) 'description': description.trim(),
      'categoryId': categoryId,
      'weightKg': weightKg,
      if (volumeM3 != null) 'volumeM3': volumeM3,
      if (packagesCount != null) 'packagesCount': packagesCount,
      if (packageType != null) 'packageType': packageType,
      if (isFragile) 'isFragile': true,
      if (tempMinC != null) 'tempMinC': tempMinC,
      if (tempMaxC != null) 'tempMaxC': tempMaxC,
      'pickup': point(pickup!, pickupContactName, pickupContactPhone),
      'delivery': point(delivery!, deliveryContactName, deliveryContactPhone),
      'pickupFrom': pickupFrom!.toUtc().toIso8601String(),
      'pickupTo': pickupTo!.toUtc().toIso8601String(),
      if (deliveryBy != null) 'deliveryBy': deliveryBy!.toUtc().toIso8601String(),
      if (vehicleTypeIds.isNotEmpty) 'requiredVehicleTypeIds': vehicleTypeIds,
      if (bodyTypeIds.isNotEmpty) 'requiredBodyTypeIds': bodyTypeIds,
      if (specialRequirementIds.isNotEmpty)
        'specialRequirementIds': specialRequirementIds,
      // Tiyin `int` bo'lib ketadi: 60 000 000 000 tiyin ham 64-bitga sig'adi
      if (priceTiyin != null) 'priceTiyin': priceTiyin!.toInt(),
      if (isNegotiableEffective) 'isNegotiable': true,
      'paymentMethod': paymentMethod,
      'publishNow': publishNow,
    };
  }

  LoadDraft copyWith({
    String? title,
    String? description,
    int? categoryId,
    int? weightKg,
    double? volumeM3,
    int? packagesCount,
    String? packageType,
    bool? isFragile,
    int? tempMinC,
    int? tempMaxC,
    Place? pickup,
    String? pickupContactName,
    String? pickupContactPhone,
    Place? delivery,
    String? deliveryContactName,
    String? deliveryContactPhone,
    DateTime? pickupFrom,
    DateTime? pickupTo,
    DateTime? deliveryBy,
    List<int>? vehicleTypeIds,
    List<int>? bodyTypeIds,
    List<int>? specialRequirementIds,
    BigInt? priceTiyin,
    bool? isNegotiable,
    String? paymentMethod,
    bool clearVolume = false,
    bool clearPackages = false,
    bool clearTemperature = false,
    bool clearDeliveryBy = false,
    bool clearPrice = false,
  }) {
    return LoadDraft(
      title: title ?? this.title,
      description: description ?? this.description,
      categoryId: categoryId ?? this.categoryId,
      weightKg: weightKg ?? this.weightKg,
      volumeM3: clearVolume ? null : (volumeM3 ?? this.volumeM3),
      packagesCount: clearPackages ? null : (packagesCount ?? this.packagesCount),
      packageType: clearPackages ? null : (packageType ?? this.packageType),
      isFragile: isFragile ?? this.isFragile,
      tempMinC: clearTemperature ? null : (tempMinC ?? this.tempMinC),
      tempMaxC: clearTemperature ? null : (tempMaxC ?? this.tempMaxC),
      pickup: pickup ?? this.pickup,
      pickupContactName: pickupContactName ?? this.pickupContactName,
      pickupContactPhone: pickupContactPhone ?? this.pickupContactPhone,
      delivery: delivery ?? this.delivery,
      deliveryContactName: deliveryContactName ?? this.deliveryContactName,
      deliveryContactPhone: deliveryContactPhone ?? this.deliveryContactPhone,
      pickupFrom: pickupFrom ?? this.pickupFrom,
      pickupTo: pickupTo ?? this.pickupTo,
      deliveryBy: clearDeliveryBy ? null : (deliveryBy ?? this.deliveryBy),
      vehicleTypeIds: vehicleTypeIds ?? this.vehicleTypeIds,
      bodyTypeIds: bodyTypeIds ?? this.bodyTypeIds,
      specialRequirementIds: specialRequirementIds ?? this.specialRequirementIds,
      priceTiyin: clearPrice ? null : (priceTiyin ?? this.priceTiyin),
      isNegotiable: isNegotiable ?? this.isNegotiable,
      paymentMethod: paymentMethod ?? this.paymentMethod,
    );
  }
}

/// Spravochniklar — viloyatlar, transport turlari, yuk kategoriyalari.
///
/// NEGA UCHALA TIL HAM SAQLANADI: backend to'plamni uch tilda beradi va
/// ilova uni lokal saqlaydi. Foydalanuvchi tilni almashtirsa yoki
/// internetsiz qolsa — qayta so'rov kerak emas.
library;

import '../../../core/utils/money.dart';

/// Spravochnik nomi qaysi tilda olinadi.
///
/// Interfeys tili (`AppLocale`) bilan aralashtirilmaydi: bu enum
/// ma'lumot modeliga tegishli va Flutter'ni bilmaydi. Ular orasidagi
/// ko'prik — `core/l10n/formatters.dart` dagi `context.language`.
enum AppLanguage { uz, ru, en }

/// Uch tilli nom.
class LocalizedName {
  const LocalizedName({required this.uz, required this.ru, required this.en});

  factory LocalizedName.fromJson(Map<String, dynamic> json) {
    final uz = json['nameUz'] as String? ?? '';
    return LocalizedName(
      uz: uz,
      // Tarjima bo'lmasa o'zbekchaga qaytamiz — bo'sh satr ko'rsatishdan
      // ko'ra tushunarli
      ru: json['nameRu'] as String? ?? uz,
      en: json['nameEn'] as String? ?? uz,
    );
  }

  final String uz;
  final String ru;
  final String en;

  String of(AppLanguage language) => switch (language) {
        AppLanguage.uz => uz,
        AppLanguage.ru => ru,
        AppLanguage.en => en,
      };

  @override
  String toString() => uz;
}

class District {
  const District({required this.id, required this.name});

  factory District.fromJson(Map<String, dynamic> json) => District(
        id: json['id'] as int,
        name: LocalizedName.fromJson(json),
      );

  final int id;
  final LocalizedName name;
}

class Region {
  const Region({
    required this.id,
    required this.code,
    required this.name,
    required this.lat,
    required this.lng,
    required this.districts,
  });

  factory Region.fromJson(Map<String, dynamic> json) => Region(
        id: json['id'] as int,
        code: json['code'] as String? ?? '',
        name: LocalizedName.fromJson(json),
        lat: (json['lat'] as num?)?.toDouble() ?? 0,
        lng: (json['lng'] as num?)?.toDouble() ?? 0,
        districts: (json['districts'] as List<dynamic>? ?? const [])
            .map((item) => District.fromJson(item as Map<String, dynamic>))
            .toList(),
      );

  final int id;
  final String code;
  final LocalizedName name;

  /// Viloyat markazi — manzil xaritada tanlanmaganda boshlang'ich nuqta.
  final double lat;
  final double lng;

  final List<District> districts;
}

class VehicleType {
  const VehicleType({
    required this.id,
    required this.code,
    required this.name,
    required this.minCapacityKg,
    required this.maxCapacityKg,
    required this.typicalVolumeM3,
  });

  factory VehicleType.fromJson(Map<String, dynamic> json) => VehicleType(
        id: json['id'] as int,
        code: json['code'] as String? ?? '',
        name: LocalizedName.fromJson(json),
        minCapacityKg: (json['minCapacityKg'] as num?)?.toInt() ?? 0,
        maxCapacityKg: (json['maxCapacityKg'] as num?)?.toInt() ?? 0,
        // NUMERIC — server uni satr qilib qaytaradi
        typicalVolumeM3: double.tryParse('${json['typicalVolumeM3']}') ?? 0,
      );

  final int id;
  final String code;
  final LocalizedName name;
  final int minCapacityKg;
  final int maxCapacityKg;
  final double typicalVolumeM3;

  /// Shu og'irlikdagi yuk uchun mos transportmi.
  bool fits(int weightKg) => weightKg <= maxCapacityKg;

  /// "1.5–3 t" ko'rinishidagi qisqa yozuv (o'zbekcha birliklar).
  String get capacityLabel => capacityLabelFor(UnitLabels.uz);

  /// Joriy til birliklari bilan: ruscha "1.5–3 т".
  String capacityLabelFor(UnitLabels units) {
    String t(int kg) {
      final tons = kg / 1000;
      return tons >= 1
          ? (tons == tons.roundToDouble() ? '${tons.round()}' : tons.toStringAsFixed(1))
          : '$kg';
    }

    final unit = maxCapacityKg >= 1000 ? ' ${units.ton}' : ' ${units.kg}';
    return '${t(minCapacityKg)}–${t(maxCapacityKg)}$unit';
  }
}

class BodyType {
  const BodyType({
    required this.id,
    required this.code,
    required this.name,
    required this.isTemperatureControlled,
  });

  factory BodyType.fromJson(Map<String, dynamic> json) => BodyType(
        id: json['id'] as int,
        code: json['code'] as String? ?? '',
        name: LocalizedName.fromJson(json),
        isTemperatureControlled: json['isTemperatureControlled'] as bool? ?? false,
      );

  final int id;
  final String code;
  final LocalizedName name;

  /// Refrijerator va izotermik kuzovlar — harorat maydonlari shularda ochiladi.
  final bool isTemperatureControlled;
}

class CargoCategory {
  const CargoCategory({
    required this.id,
    required this.code,
    required this.name,
    required this.requiresSpecialPermit,
  });

  factory CargoCategory.fromJson(Map<String, dynamic> json) => CargoCategory(
        id: json['id'] as int,
        code: json['code'] as String? ?? '',
        name: LocalizedName.fromJson(json),
        requiresSpecialPermit: json['requiresSpecialPermit'] as bool? ?? false,
      );

  final int id;
  final String code;
  final LocalizedName name;

  /// Maxsus ruxsatnoma kerak (masalan xavfli yuk) — foydalanuvchini
  /// ogohlantiramiz, aks holda e'lon keyin bekor qilinadi.
  final bool requiresSpecialPermit;
}

class SpecialRequirement {
  const SpecialRequirement({
    required this.id,
    required this.code,
    required this.name,
    required this.extraCostHintTiyin,
  });

  factory SpecialRequirement.fromJson(Map<String, dynamic> json) => SpecialRequirement(
        id: json['id'] as int,
        code: json['code'] as String? ?? '',
        name: LocalizedName.fromJson(json),
        extraCostHintTiyin: json['extraCostHintTiyin']?.toString() ?? '0',
      );

  final int id;
  final String code;
  final LocalizedName name;

  /// Taxminiy qo'shimcha xarajat — mijoz narxni to'g'ri qo'yishi uchun.
  final String extraCostHintTiyin;
}

/// Butun spravochnik to'plami.
class ReferenceBundle {
  const ReferenceBundle({
    required this.version,
    required this.regions,
    required this.vehicleTypes,
    required this.bodyTypes,
    required this.cargoCategories,
    required this.specialRequirements,
  });

  factory ReferenceBundle.fromJson(Map<String, dynamic> json) {
    List<T> parse<T>(String key, T Function(Map<String, dynamic>) build) {
      return (json[key] as List<dynamic>? ?? const [])
          .map((item) => build(item as Map<String, dynamic>))
          .toList();
    }

    return ReferenceBundle(
      version: json['version'] as String? ?? '',
      regions: parse('regions', Region.fromJson),
      vehicleTypes: parse('vehicleTypes', VehicleType.fromJson),
      bodyTypes: parse('bodyTypes', BodyType.fromJson),
      cargoCategories: parse('cargoCategories', CargoCategory.fromJson),
      specialRequirements: parse('specialRequirements', SpecialRequirement.fromJson),
    );
  }

  final String version;
  final List<Region> regions;
  final List<VehicleType> vehicleTypes;
  final List<BodyType> bodyTypes;
  final List<CargoCategory> cargoCategories;
  final List<SpecialRequirement> specialRequirements;

  bool get isEmpty => regions.isEmpty || cargoCategories.isEmpty;

  Region? regionById(int id) {
    for (final region in regions) {
      if (region.id == id) return region;
    }
    return null;
  }

  VehicleType? vehicleTypeById(int id) {
    for (final type in vehicleTypes) {
      if (type.id == id) return type;
    }
    return null;
  }

  BodyType? bodyTypeById(int id) {
    for (final type in bodyTypes) {
      if (type.id == id) return type;
    }
    return null;
  }

  CargoCategory? categoryById(int id) {
    for (final category in cargoCategories) {
      if (category.id == id) return category;
    }
    return null;
  }

  /// Shu og'irlikni ko'tara oladigan transport turlari.
  List<VehicleType> vehicleTypesFor(int weightKg) =>
      vehicleTypes.where((type) => type.fits(weightKg)).toList();
}

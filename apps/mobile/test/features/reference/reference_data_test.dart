import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/reference/domain/reference_data.dart';

/// Spravochnik modellari — serverning haqiqiy javob shakli bo'yicha.
///
/// Bu yerdagi JSON `GET /v1/reference/all` dan olingan: NUMERIC
/// maydonlar SATR bo'lib keladi (`"3.00"`), chunki `pg` aniqlikni
/// yo'qotmaslik uchun ularni shunday qaytaradi.
void main() {
  final json = <String, dynamic>{
    'version': '7e49a04300f8a44a',
    'regions': [
      {
        'id': 1,
        'code': 'TAS_C',
        'nameUz': 'Toshkent shahri',
        'nameRu': 'город Ташкент',
        'nameEn': 'Tashkent City',
        'lat': 41.2995,
        'lng': 69.2401,
        'districts': [
          {'id': 2, 'nameUz': 'Chilonzor', 'nameRu': 'Чиланзар', 'nameEn': 'Chilanzar'},
        ],
      },
      {
        'id': 3,
        'code': 'SAM',
        'nameUz': 'Samarqand',
        'nameRu': 'Самарканд',
        'nameEn': 'Samarkand',
        'lat': 39.65,
        'lng': 66.95,
        'districts': <dynamic>[],
      },
    ],
    'vehicleTypes': [
      {
        'id': 1,
        'code': 'DAMAS',
        'nameUz': 'Damas',
        'nameRu': 'Дамас',
        'nameEn': 'Damas',
        'minCapacityKg': 300,
        'maxCapacityKg': 800,
        'typicalVolumeM3': '3.00',
      },
      {
        'id': 4,
        'code': 'TRUCK_5T',
        'nameUz': 'Yuk mashinasi 5t',
        'nameRu': 'Грузовик 5т',
        'nameEn': 'Truck 5t',
        'minCapacityKg': 3000,
        'maxCapacityKg': 5000,
        'typicalVolumeM3': '25.00',
      },
    ],
    'bodyTypes': [
      {'id': 1, 'code': 'TENT', 'nameUz': 'Tentli', 'isTemperatureControlled': false},
      {'id': 2, 'code': 'REF', 'nameUz': 'Refrijerator', 'isTemperatureControlled': true},
    ],
    'cargoCategories': [
      {'id': 1, 'code': 'FOOD', 'nameUz': 'Oziq-ovqat', 'requiresSpecialPermit': false},
      {'id': 9, 'code': 'DANGEROUS', 'nameUz': 'Xavfli yuk', 'requiresSpecialPermit': true},
    ],
    'specialRequirements': [
      {'id': 1, 'code': 'LOADER', 'nameUz': 'Yuk koʻtaruvchi', 'extraCostHintTiyin': '5000000'},
    ],
  };

  test('toʻplam toʻliq oʻqiladi', () {
    final bundle = ReferenceBundle.fromJson(json);

    expect(bundle.version, '7e49a04300f8a44a');
    expect(bundle.regions, hasLength(2));
    expect(bundle.vehicleTypes, hasLength(2));
    expect(bundle.bodyTypes, hasLength(2));
    expect(bundle.cargoCategories, hasLength(2));
    expect(bundle.specialRequirements, hasLength(1));
    expect(bundle.isEmpty, isFalse);
  });

  test('★ NUMERIC SATRDAN OʻQILADI', () {
    final bundle = ReferenceBundle.fromJson(json);
    expect(bundle.vehicleTypeById(1)!.typicalVolumeM3, 3.0);
  });

  test('tarjima boʻlmasa oʻzbekchaga qaytadi', () {
    final bundle = ReferenceBundle.fromJson(json);
    final tent = bundle.bodyTypeById(1)!;

    expect(tent.name.uz, 'Tentli');
    expect(tent.name.ru, 'Tentli');
    expect(tent.name.of(AppLanguage.en), 'Tentli');
  });

  test('uch tilli nom', () {
    final bundle = ReferenceBundle.fromJson(json);
    final region = bundle.regionById(1)!;

    expect(region.name.of(AppLanguage.uz), 'Toshkent shahri');
    expect(region.name.of(AppLanguage.ru), 'город Ташкент');
    expect(region.name.of(AppLanguage.en), 'Tashkent City');
    expect(region.districts.single.name.uz, 'Chilonzor');
  });

  test('★ OGʻIRLIKKA MOS TRANSPORT TANLANADI', () {
    final bundle = ReferenceBundle.fromJson(json);

    // 4 tonna — Damas koʻtara olmaydi
    final forFourTons = bundle.vehicleTypesFor(4000);
    expect(forFourTons.map((type) => type.code), ['TRUCK_5T']);

    // 500 kg — ikkalasi ham mos
    expect(bundle.vehicleTypesFor(500), hasLength(2));

    // 10 tonna — hech biri
    expect(bundle.vehicleTypesFor(10000), isEmpty);
  });

  test('quvvat yorligʻi tonnada', () {
    final bundle = ReferenceBundle.fromJson(json);

    expect(bundle.vehicleTypeById(1)!.capacityLabel, '300–800 kg');
    expect(bundle.vehicleTypeById(4)!.capacityLabel, '3–5 t');
  });

  test('maxsus ruxsatnoma bayrogʻi', () {
    final bundle = ReferenceBundle.fromJson(json);

    expect(bundle.categoryById(1)!.requiresSpecialPermit, isFalse);
    expect(bundle.categoryById(9)!.requiresSpecialPermit, isTrue);
  });

  test('harorat nazorati bayrogʻi', () {
    final bundle = ReferenceBundle.fromJson(json);
    expect(bundle.bodyTypeById(2)!.isTemperatureControlled, isTrue);
  });

  test('★ BOʻSH TOʻPLAM ANIQLANADI', () {
    // Eski ilova versiyasidan qolgan chala kesh ishlatilmasligi kerak
    final empty = ReferenceBundle.fromJson({'version': 'x'});
    expect(empty.isEmpty, isTrue);
  });

  test('nomaʼlum id — null', () {
    final bundle = ReferenceBundle.fromJson(json);

    expect(bundle.regionById(999), isNull);
    expect(bundle.vehicleTypeById(999), isNull);
    expect(bundle.bodyTypeById(999), isNull);
    expect(bundle.categoryById(999), isNull);
  });
}

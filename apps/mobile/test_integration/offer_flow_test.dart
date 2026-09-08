import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/features/auth/data/auth_repository.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/loads/data/loads_repository.dart';
import 'package:karvon/features/offers/data/offers_repository.dart';
import 'package:karvon/features/vehicles/data/vehicles_repository.dart';

import 'support/memory_token_storage.dart';

/// Yuk → lenta → taklif oqimi HAQIQIY backend bilan.
///
/// Bu yerda mobil modellar serverning haqiqiy javob formatiga mos
/// kelishi tekshiriladi. Unit testlar buni ushlay olmaydi: ular biz
/// o'ylagan format bo'yicha yoziladi.
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
void main() {
  final random = Random();

  String phone(String prefix) =>
      '+998$prefix${random.nextInt(9000000) + 1000000}';

  String plate() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVXYZ';
    String pick() => letters[random.nextInt(letters.length)];
    return '${random.nextInt(90) + 10}${pick()}'
        '${random.nextInt(900) + 100}${pick()}${pick()}';
  }

  /// Kirgan foydalanuvchi yaratadi va uning mijozlarini qaytaradi.
  Future<({ApiClient api, AuthRepository auth, MemoryTokenStorage storage, AppUser user})>
      signUp(String prefix, UserRole role) async {
    final storage = MemoryTokenStorage();
    final api = ApiClient(storage: storage);
    final auth = AuthRepository(api: api, storage: storage);

    final number = phone(prefix);
    final challenge = await auth.requestOtp(number);
    await auth.verifyOtp(phone: number, code: challenge.devCode!);

    final user = await auth.completeProfile(
      firstName: 'Test',
      lastName: role == UserRole.driver ? 'Haydovchi' : 'Mijoz',
      role: role,
    );

    return (api: api, auth: auth, storage: storage, user: user);
  }

  test('yuk yaratiladi va lentada koʻrinadi', () async {
    final shipper = await signUp('90', UserRole.shipper);
    final loads = LoadsRepository(shipper.api);

    final created = await loads.create({
      'title': 'Integratsiya testi uchun yuk',
      'categoryId': 3,
      'weightKg': 4000,
      'pickup': {
        'address': 'Toshkent, Yunusobod 108',
        'lat': 41.3111,
        'lng': 69.2797,
      },
      'delivery': {
        'address': 'Samarqand, Registon',
        'lat': 39.6542,
        'lng': 66.9597,
      },
      'pickupFrom': DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
      'pickupTo': DateTime.now().add(const Duration(hours: 8)).toIso8601String(),
      'priceTiyin': 20000000,
      'publishNow': true,
    });

    // Model server javobini toʻgʻri oʻqidimi
    expect(created.id, isNotEmpty);
    expect(created.title, 'Integratsiya testi uchun yuk');
    expect(created.weightKg, 4000);
    expect(created.hasPrice, isTrue);
    expect(created.priceTiyin, '20000000');
    expect(created.status.isOpen, isTrue);
    // Masofa server tomonidan hisoblanadi
    expect(created.distanceKm, isNotNull);
    expect(created.pickup.regionName, isNotNull);

    // Egasi toʻliq telefon raqamini koʻradi
    final own = await loads.byId(created.id);
    expect(own.id, created.id);
  });

  test('narx tavsiyasi keladi', () async {
    final shipper = await signUp('90', UserRole.shipper);
    final loads = LoadsRepository(shipper.api);

    final estimate = await loads.estimate(
      fromLat: 41.3111,
      fromLng: 69.2797,
      toLat: 39.6542,
      toLng: 66.9597,
      weightKg: 4000,
    );

    expect(estimate.distanceKm, greaterThan(200));
    expect(int.parse(estimate.suggestedPriceTiyin), greaterThan(0));
    expect(estimate.pickupRegionName, 'Toshkent shahri');
    expect(estimate.deliveryRegionName, 'Samarqand');
  });

  test('★ TOʻLIQ OQIM: yuk → lenta → taklif', () async {
    // 1. Mijoz yuk eʼlon qiladi
    final shipper = await signUp('90', UserRole.shipper);
    final shipperLoads = LoadsRepository(shipper.api);

    final load = await shipperLoads.create({
      'title': 'Mebel',
      'categoryId': 3,
      'weightKg': 3000,
      'pickup': {'address': 'Toshkent, Chilonzor', 'lat': 41.2856, 'lng': 69.2034},
      'delivery': {'address': 'Samarqand', 'lat': 39.6542, 'lng': 66.9597},
      'pickupFrom': DateTime.now().add(const Duration(hours: 3)).toIso8601String(),
      'pickupTo': DateTime.now().add(const Duration(hours: 9)).toIso8601String(),
      'priceTiyin': 18000000,
      'publishNow': true,
    });

    // 2. Haydovchi roʻyxatdan oʻtadi va transport qoʻshadi
    final driver = await signUp('93', UserRole.driver);
    final vehicles = VehiclesRepository(driver.api);

    final vehicle = await vehicles.create({
      'vehicleTypeId': 4,
      'bodyTypeId': 1,
      'brand': 'Isuzu',
      'model': 'NPR',
      'plateNumber': plate(),
      'capacityKg': 5000,
      'volumeM3': 25,
    });

    expect(vehicle.canSendOffers, isFalse,
        reason: 'yangi transport hali tasdiqlanmagan');
    expect(vehicle.fits(3000), isTrue);
    // Davlat raqami server tomonidan formatlanadi
    expect(vehicle.plateFormatted, contains(' '));

    // 3. Tasdiqlanmagan haydovchi taklif yubora olmaydi
    final offers = OffersRepository(driver.api);

    await expectLater(
      offers.send(loadId: load.id, vehicleId: vehicle.id),
      throwsA(
        isA<ApiException>().having(
          (e) => e.code,
          'code',
          anyOf('DRIVER_NOT_VERIFIED', 'VEHICLE_NOT_VERIFIED'),
        ),
      ),
      reason: 'verifikatsiyasiz taklif yuborib boʻlmaydi',
    );

    // Xato foydalanuvchi tiliga tarjima qilinadi
    try {
      await offers.send(loadId: load.id, vehicleId: vehicle.id);
    } on ApiException catch (error) {
      expect(localizeError(error), isNot(contains('_')));
    }
  });

  test('oʻz yukiga taklif yuborib boʻlmaydi', () async {
    final user = await signUp('90', UserRole.both);
    final loads = LoadsRepository(user.api);
    final vehicles = VehiclesRepository(user.api);
    final offers = OffersRepository(user.api);

    final load = await loads.create({
      'title': 'Oʻz yukim',
      'categoryId': 3,
      'weightKg': 2000,
      'pickup': {'address': 'Toshkent', 'lat': 41.3111, 'lng': 69.2797},
      'delivery': {'address': 'Samarqand', 'lat': 39.6542, 'lng': 66.9597},
      'pickupFrom': DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
      'pickupTo': DateTime.now().add(const Duration(hours: 8)).toIso8601String(),
      'priceTiyin': 15000000,
      'publishNow': true,
    });

    final vehicle = await vehicles.create({
      'vehicleTypeId': 4,
      'bodyTypeId': 1,
      'brand': 'Isuzu',
      'model': 'NPR',
      'plateNumber': plate(),
      'capacityKg': 5000,
      'volumeM3': 25,
    });

    await expectLater(
      offers.send(loadId: load.id, vehicleId: vehicle.id),
      throwsA(isA<ApiException>()),
    );
  });

  test('lenta sahifalanadi va kursor qaytadi', () async {
    final driver = await signUp('93', UserRole.driver);
    final loads = LoadsRepository(driver.api);

    final page = await loads.feed();

    // Kursor mavjud boʻlsa — u satr boʻlishi kerak
    if (page.hasMore) {
      expect(page.nextCursor, isNotNull);
      final next = await loads.feed(cursor: page.nextCursor);
      // Ikkinchi sahifada birinchisidagi yuklar takrorlanmasligi kerak
      final firstIds = page.items.map((l) => l.id).toSet();
      final duplicates = next.items.where((l) => firstIds.contains(l.id));
      expect(duplicates, isEmpty, reason: 'kursorli sahifalash takrorlamasligi kerak');
    }
  });
}

import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/features/auth/data/auth_repository.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/geo/data/geo_repository.dart';
import 'package:karvon/features/geo/domain/place.dart';
import 'package:karvon/features/loads/data/loads_repository.dart';
import 'package:karvon/features/loads/domain/load.dart';
import 'package:karvon/features/loads/domain/load_draft.dart';
import 'package:karvon/features/reference/data/reference_repository.dart';

import 'support/memory_token_storage.dart';

/// Spravochnik, manzil qidiruvi va yuk yaratish — HAQIQIY backend bilan.
///
/// Unit testlar formani BIZ o'ylagan shakl bo'yicha tekshiradi. Bu
/// yerda esa shakl serverning haqiqiy talabiga mos kelishi sinaladi:
/// bitta ortiqcha maydon ham `whitelist: true` tufayli 400 qaytaradi.
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
void main() {
  final random = Random();

  Future<({ApiClient api, AppUser user})> signUpShipper() async {
    final storage = MemoryTokenStorage();
    final api = ApiClient(storage: storage);
    final auth = AuthRepository(api: api, storage: storage);

    final phone = '+99890${random.nextInt(9000000) + 1000000}';
    final challenge = await auth.requestOtp(phone);
    await auth.verifyOtp(phone: phone, code: challenge.devCode!);

    final user = await auth.completeProfile(
      firstName: 'Test',
      lastName: 'Mijoz',
      role: UserRole.shipper,
    );

    return (api: api, user: user);
  }

  test('★ SPRAVOCHNIK SERVER JAVOBIDAN OʻQILADI', () async {
    final shipper = await signUpShipper();
    // `SharedPreferences` testda platforma kanalisiz ishlamaydi —
    // shuning uchun kesh ishlatilmaydi, faqat tarmoq javobi
    final bundle = await ReferenceRepository(shipper.api).load(forceRefresh: true);

    expect(bundle.version, isNotEmpty);
    // O'zbekistonda 14 ta hududiy birlik
    expect(bundle.regions, hasLength(14));
    expect(bundle.vehicleTypes, isNotEmpty);
    expect(bundle.bodyTypes, isNotEmpty);
    expect(bundle.cargoCategories, isNotEmpty);

    // Toshkent shahri markazi — koordinata haqiqiy bo'lishi kerak
    final tashkent = bundle.regions.firstWhere((region) => region.code == 'TAS_C');
    expect(tashkent.lat, closeTo(41.3, 0.5));
    expect(tashkent.lng, closeTo(69.2, 0.5));
    expect(tashkent.districts, isNotEmpty);

    // Quvvat maydonlari NUMERIC — satr bo'lib kelsa ham son bo'lib o'qiladi
    final anyVehicle = bundle.vehicleTypes.first;
    expect(anyVehicle.maxCapacityKg, greaterThan(0));
    expect(anyVehicle.typicalVolumeM3, greaterThan(0));
  });

  test('manzil qidiruvi koordinata bilan qaytadi', () async {
    final shipper = await signUpShipper();
    final places = await GeoRepository(shipper.api).search('Chilonzor');

    expect(places, isNotEmpty);
    for (final place in places) {
      expect(place.isValid, isTrue, reason: 'koordinatasiz manzil formani buzadi');
      expect(place.label, isNotEmpty);
    }
  });

  test('qisqa soʻrovda serverga bormaydi', () async {
    final shipper = await signUpShipper();
    // Server 3 belgidan qisqa so'rovni rad etadi; mijoz uni
    // umuman yubormasligi kerak — aks holda foydalanuvchi har
    // harfda xato ko'radi
    expect(await GeoRepository(shipper.api).search('ch'), isEmpty);
  });

  test('★ QORALAMA SERVER TALABIGA MOS SHAKLDA YUBORILADI', () async {
    final shipper = await signUpShipper();
    final loads = LoadsRepository(shipper.api);

    final draft = LoadDraft(
      title: 'Integratsiya: mebel',
      description: 'Shisha eshiklar bor',
      categoryId: 3,
      weightKg: 4000,
      volumeM3: 18.5,
      packagesCount: 5,
      packageType: 'palet',
      isFragile: true,
      pickup: const Place(
        label: 'Toshkent, Chilonzor 19',
        lat: 41.2856,
        lng: 69.2034,
      ),
      pickupContactName: 'Anvar aka',
      pickupContactPhone: '+998901234567',
      delivery: const Place(
        label: 'Samarqand, Registon',
        lat: 39.6542,
        lng: 66.9597,
      ),
      pickupFrom: DateTime.now().add(const Duration(hours: 2)),
      pickupTo: DateTime.now().add(const Duration(hours: 8)),
      deliveryBy: DateTime.now().add(const Duration(days: 2)),
      vehicleTypeIds: const [4],
      bodyTypeIds: const [1],
      priceTiyin: BigInt.from(240000000),
      isNegotiable: true,
      paymentMethod: 'ESCROW',
    );

    final load = await loads.create(draft.toCreateBody(publishNow: true));

    expect(load.title, 'Integratsiya: mebel');
    expect(load.weightKg, 4000);
    expect(load.priceTiyin, '240000000');
    expect(load.isNegotiable, isTrue);
    expect(load.status.isOpen, isTrue);
    // Masofa va viloyat server tomonidan hisoblanadi
    expect(load.distanceKm, greaterThan(200));
    expect(load.pickup.regionName, 'Toshkent shahri');
    expect(load.delivery.regionName, 'Samarqand');
  });

  test('qoralama saqlanadi va lentaga chiqmaydi', () async {
    final shipper = await signUpShipper();
    final loads = LoadsRepository(shipper.api);

    final draft = LoadDraft(
      title: 'Integratsiya: qoralama',
      categoryId: 3,
      weightKg: 2000,
      pickup: const Place(label: 'Toshkent', lat: 41.3111, lng: 69.2797),
      delivery: const Place(label: 'Samarqand', lat: 39.6542, lng: 66.9597),
      pickupFrom: DateTime.now().add(const Duration(hours: 2)),
      pickupTo: DateTime.now().add(const Duration(hours: 8)),
    );

    final load = await loads.create(draft.toCreateBody(publishNow: false));
    expect(load.status, LoadStatus.draft);

    final drafts = await loads.myLoads(status: 'draft');
    expect(drafts.items.map((item) => item.id), contains(load.id));

    final active = await loads.myLoads(status: 'active');
    expect(active.items.map((item) => item.id), isNot(contains(load.id)));
  });

  test('★ HOLAT BANDLARI SERVERDA QOʻLLANADI', () async {
    final shipper = await signUpShipper();
    final loads = LoadsRepository(shipper.api);

    LoadDraft base(String title) => LoadDraft(
          title: title,
          categoryId: 3,
          weightKg: 2500,
          pickup: const Place(label: 'Toshkent', lat: 41.3111, lng: 69.2797),
          delivery: const Place(label: 'Samarqand', lat: 39.6542, lng: 66.9597),
          pickupFrom: DateTime.now().add(const Duration(hours: 2)),
          pickupTo: DateTime.now().add(const Duration(hours: 8)),
          priceTiyin: BigInt.from(20000000),
        );

    final published = await loads.create(base('Faol').toCreateBody(publishNow: true));
    final cancelled = await loads.create(base('Bekor').toCreateBody(publishNow: true));
    await loads.cancel(cancelled.id, 'Rejalar oʻzgardi');

    final active = (await loads.myLoads(status: 'active')).items.map((item) => item.id);
    final cancelledIds =
        (await loads.myLoads(status: 'cancelled')).items.map((item) => item.id);

    expect(active, contains(published.id));
    expect(active, isNot(contains(cancelled.id)));
    expect(cancelledIds, contains(cancelled.id));
  });
}

import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/features/auth/data/auth_repository.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/profile/data/profile_repository.dart';
import 'package:karvon/features/profile/domain/driver_readiness.dart';
import 'package:karvon/features/vehicles/data/vehicles_repository.dart';
import 'package:karvon/features/vehicles/domain/vehicle.dart';

import 'support/memory_token_storage.dart';

/// Haydovchi profili — HAQIQIY backend bilan.
///
/// "NIMA YETISHMAYAPTI" QOIDASI SERVERDA. Test aynan shuni tekshiradi:
/// har bir qadam bajarilgach ro'yxat qisqaradi va oxirida taklif
/// yuborish ochiladi.
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
void main() {
  final random = Random();

  String plate() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVXYZ';
    String pick() => letters[random.nextInt(letters.length)];
    return '${random.nextInt(90) + 10}${pick()}'
        '${random.nextInt(900) + 100}${pick()}${pick()}';
  }

  Future<({ProfileRepository profile, VehiclesRepository vehicles, AppUser user})>
      signUpDriver() async {
    final storage = MemoryTokenStorage();
    final api = ApiClient(storage: storage);
    final auth = AuthRepository(api: api, storage: storage);

    final phone = '+99893${random.nextInt(9000000) + 1000000}';
    final challenge = await auth.requestOtp(phone);
    await auth.verifyOtp(phone: phone, code: challenge.devCode!);
    final user = await auth.completeProfile(
      firstName: 'Test',
      lastName: 'Haydovchi',
      role: UserRole.driver,
    );

    return (
      profile: ProfileRepository(api),
      vehicles: VehiclesRepository(api),
      user: user,
    );
  }

  test('★ YANGI HAYDOVCHIDA NIMA YETISHMASLIGI AYTILADI', () async {
    final driver = await signUpDriver();
    final readiness = await driver.profile.readiness();

    expect(readiness.profileComplete, isTrue);
    expect(readiness.canSendOffers, isFalse);
    expect(readiness.verificationStatus, VerificationStatus.notSubmitted);

    // Toʻrtta qadam qoladi: pasport, guvohnoma, transport, yoʻnalish
    expect(readiness.missingSteps, containsAll([
      ReadinessStep.identityDocument,
      ReadinessStep.driverLicense,
      ReadinessStep.verifiedVehicle,
      ReadinessStep.routes,
    ]));
    expect(readiness.completedCount, 1);
  });

  test('★ HUJJATSIZ TEKSHIRUVGA YUBORIB BOʻLMAYDI', () async {
    final driver = await signUpDriver();

    // Boʻsh soʻrovni adminga yuborish uning vaqtini yeydi
    expect((await driver.profile.readiness()).canSubmit, isFalse);

    await expectLater(
      driver.profile.submitVerification(),
      throwsA(isA<ApiException>()),
    );
  });

  test('★ TRANSPORT QOʻSHILGACH ROʻYXAT QISQARADI', () async {
    final driver = await signUpDriver();

    final vehicle = await driver.vehicles.create({
      'vehicleTypeId': 4,
      'bodyTypeId': 1,
      'brand': 'Isuzu',
      'model': 'NPR',
      'plateNumber': plate(),
      'capacityKg': 5000,
      'volumeM3': 25,
    });

    // Yangi transport avtomatik ASOSIY boʻladi
    expect(vehicle.isPrimary, isTrue);
    // Lekin hali tasdiqlanmagan — taklif yuborib boʻlmaydi
    expect(vehicle.verificationStatus.isVerified, isFalse);
    // Davlat raqami server tomonidan formatlanadi
    expect(vehicle.plateFormatted, contains(' '));

    final mine = await driver.vehicles.mine();
    expect(mine.map((item) => item.id), contains(vehicle.id));

    // `VERIFIED_VEHICLE` hali roʻyxatda: transport bor, lekin
    // tasdiqlanmagan
    final readiness = await driver.profile.readiness();
    expect(readiness.missingSteps, contains(ReadinessStep.verifiedVehicle));
  });

  test('★ YOʻNALISH QOʻSHILGACH QADAM BAJARILADI', () async {
    final driver = await signUpDriver();

    var readiness = await driver.profile.readiness();
    expect(readiness.hasRoutes, isFalse);

    // Toshkent shahri (1) → Samarqand (3)
    final routes = await driver.profile.addRoute(
      fromRegionId: 1,
      toRegionId: 3,
      isRegular: true,
    );

    expect(routes, hasLength(1));
    expect(routes.first.label, 'Toshkent shahri → Samarqand');
    expect(routes.first.isRegular, isTrue);

    readiness = await driver.profile.readiness();
    expect(readiness.hasRoutes, isTrue);
    expect(readiness.missingSteps, isNot(contains(ReadinessStep.routes)));
  });

  test('★ MANZILSIZ YOʻNALISH — "ISTALGAN YOʻNALISH"', () async {
    final driver = await signUpDriver();

    final routes = await driver.profile.addRoute(fromRegionId: 1);

    expect(routes.first.toRegionId, isNull);
    expect(routes.first.label, contains('istalgan yoʻnalish'));
  });

  test('yoʻnalish oʻchiriladi', () async {
    final driver = await signUpDriver();

    final routes = await driver.profile.addRoute(fromRegionId: 1, toRegionId: 3);
    await driver.profile.removeRoute(routes.first.id);

    expect(await driver.profile.routes(), isEmpty);
    expect((await driver.profile.readiness()).hasRoutes, isFalse);
  });

  test('★ TASDIQLANMAGAN HAYDOVCHI "BOʻSH" HOLATGA OʻTA OLMAYDI', () async {
    final driver = await signUpDriver();

    // Oflayn boʻlish har doim mumkin: dam olishni taqiqlab boʻlmaydi
    await driver.profile.setAvailability('OFFLINE');

    // "Boʻsh" esa matchingga tushish degani — tasdiqlanmagan haydovchi
    // yuklar roʻyxatiga chiqmasligi kerak
    await expectLater(
      driver.profile.setAvailability('AVAILABLE'),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'DRIVER_NOT_VERIFIED'),
      ),
    );
  });

  test('notoʻgʻri bandlik holati rad etiladi', () async {
    final driver = await signUpDriver();

    await expectLater(
      driver.profile.setAvailability('SLEEPING'),
      throwsA(isA<ApiException>()),
    );
  });

  test('★ ISM OʻZGARTIRILADI, TELEFON OʻZGARMAYDI', () async {
    final driver = await signUpDriver();

    final updated = await driver.profile.updateProfile(
      firstName: 'Anvar',
      lastName: 'Karimov',
    );

    expect(updated.firstName, 'Anvar');
    expect(updated.lastName, 'Karimov');
    // Telefon — sessiya va bildirishnomalar kaliti, oʻzgarmaydi
    expect(updated.phone, driver.user.phone);
  });

  test('notoʻgʻri davlat raqami rad etiladi', () async {
    final driver = await signUpDriver();

    await expectLater(
      driver.vehicles.create({
        'vehicleTypeId': 4,
        'bodyTypeId': 1,
        'brand': 'Isuzu',
        'model': 'NPR',
        'plateNumber': 'XX',
        'capacityKg': 5000,
      }),
      throwsA(isA<ApiException>()),
    );
  });

  test('★ TRANSPORT TURIGA MOS KELMAYDIGAN QUVVAT RAD ETILADI', () async {
    final driver = await signUpDriver();

    // Damas (1) — 300..800 kg. 20 tonna mumkin emas.
    await expectLater(
      driver.vehicles.create({
        'vehicleTypeId': 1,
        'bodyTypeId': 1,
        'brand': 'Chevrolet',
        'model': 'Damas',
        'plateNumber': plate(),
        'capacityKg': 20000,
      }),
      throwsA(isA<ApiException>()),
    );
  });
}

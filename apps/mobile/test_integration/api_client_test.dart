@Tags(['integration'])
library;

import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/core/storage/token_storage.dart';
import 'package:karvon/features/auth/data/auth_repository.dart';
import 'package:karvon/features/auth/domain/user.dart';

/// Xotiradagi token saqlagich.
///
/// Haqiqiy `TokenStorage` platforma kanallarini (Keystore/Keychain)
/// ishlatadi va test muhitida ishlamaydi. Bu vorisda faqat xotira.
class _MemoryTokenStorage extends TokenStorage {
  String? _access;
  String? _refresh;
  String? _userId;

  @override
  Future<String?> readAccessToken() async => _access;

  @override
  Future<String?> readRefreshToken() async => _refresh;

  @override
  Future<String?> readUserId() async => _userId;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    String? userId,
  }) async {
    _access = accessToken;
    _refresh = refreshToken;
    _userId = userId ?? _userId;
  }

  @override
  Future<bool> hasSession() async => _refresh != null;

  @override
  Future<void> clear() async {
    _access = null;
    _refresh = null;
    _userId = null;
  }
}

/// HAQIQIY BACKEND bilan integratsiya testi.
///
/// Bu test mock ishlatmaydi: u ishlab turgan API'ga real HTTP so'rov
/// yuboradi. Maqsad — mobil tarmoq qatlami serverning haqiqiy javob
/// formatiga mos kelishini isbotlash. Unit testlar buni ushlay olmaydi:
/// ular biz o'ylagan format bo'yicha yoziladi, server esa boshqacha
/// javob berishi mumkin.
///
/// Ishga tushirish (API ishlab turishi kerak):
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
///
/// NEGA ALOHIDA PAPKADA: odatiy `flutter test` faqat `test/` ni
/// skanerlaydi va bu papkani ko'rmaydi. Shuning uchun integratsiya
/// testlari CI'da alohida qadam bo'lib turadi va API ishlamayotganda
/// asosiy to'plamni yiqitmaydi.
void main() {
  // `TestWidgetsFlutterBinding.ensureInitialized()` BU YERDA ATAYLAB
  // CHAQIRILMAYDI.
  //
  // U barcha HTTP so'rovlarini to'sib qo'yadi va har biriga 400
  // qaytaradi ("all HTTP requests will return status code 400" —
  // Flutter'ning o'z ogohlantirishi). Bu esa integratsiya testining
  // butun ma'nosini yo'qotadi: biz aynan HAQIQIY server javobini
  // tekshirmoqchimiz.
  //
  // Platforma kanallari (device_info, package_info) bindingsiz
  // ishlamaydi — lekin `AuthRepository` ularning yiqilishini ushlab,
  // "unknown" qaytaradi. Bu ataylab: qurilma ma'lumoti qulaylik uchun
  // va u hech qachon kirishni to'xtatmasligi kerak.

  late ApiClient api;
  late _MemoryTokenStorage storage;
  late AuthRepository repository;

  setUp(() {
    storage = _MemoryTokenStorage();
    api = ApiClient(storage: storage);
    repository = AuthRepository(api: api, storage: storage);
  });

  /// Har ishga tushirishda yangi raqam — OTP soatlik limitiga
  /// urilib qolmaslik uchun
  final random = Random();
  String randomPhone() {
    final suffix = random.nextInt(9000000) + 1000000;
    return '+99890$suffix';
  }

  test('server javobi { data, meta } qobigʻidan toʻgʻri ochiladi', () async {
    final challenge = await repository.requestOtp(randomPhone());

    expect(challenge.expiresInSeconds, greaterThan(0));
    expect(challenge.resendAfterSeconds, greaterThan(0));
    // Dev muhitida kod javobda keladi — sinovni tezlashtiradi
    expect(challenge.devCode, isNotNull);
    expect(challenge.devCode!.length, 6);
  });

  test('notoʻgʻri raqam server xatosiga aylanadi', () async {
    // Shahar raqami — server rad etadi
    await expectLater(
      repository.requestOtp('+99871${random.nextInt(9000000) + 1000000}'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.code,
          'code',
          anyOf('VALIDATION_FAILED', 'OTP_INVALID_PHONE'),
        ),
      ),
    );
  });

  test('toʻliq kirish oqimi: OTP → tokenlar → profil', () async {
    final phone = randomPhone();

    final challenge = await repository.requestOtp(phone);
    final result = await repository.verifyOtp(
      phone: phone,
      code: challenge.devCode!,
    );

    expect(result.isNewUser, isTrue);
    expect(result.user.phone, phone);

    // Tokenlar saqlanganini tekshiramiz — keyingi so'rovlar shunga tayanadi
    expect(await storage.readAccessToken(), isNotNull);
    expect(await storage.readRefreshToken(), isNotNull);

    // Profil to'ldirilmagan — server shu holatni qaytarishi kerak
    expect(result.user.status.name, 'pendingProfile');
  });

  test('token avtomatik qoʻshiladi — /me himoyalangan endpoint', () async {
    final phone = randomPhone();
    final challenge = await repository.requestOtp(phone);
    await repository.verifyOtp(phone: phone, code: challenge.devCode!);

    // Profilni to'ldiramiz
    final user = await repository.completeProfile(
      firstName: 'Test',
      lastName: 'Haydovchi',
      role: UserRole.driver,
    );
    expect(user.status.name, 'active');

    // Endi token bilan /me ishlashi kerak
    final me = await repository.me();
    expect(me.id, user.id);
    expect(me.fullName, 'Test Haydovchi');
  });

  test('tokensiz himoyalangan endpoint 401 beradi', () async {
    await storage.clear();

    await expectLater(
      repository.me(),
      throwsA(
        isA<ApiException>().having((e) => e.requiresLogin, 'requiresLogin', isTrue),
      ),
    );
  });

  test('notoʻgʻri OTP kodi aniq xato kodi bilan qaytadi', () async {
    final phone = randomPhone();
    await repository.requestOtp(phone);

    await expectLater(
      repository.verifyOtp(phone: phone, code: '000000'),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'OTP_INCORRECT'),
      ),
    );
  });

  test('xato kodlari foydalanuvchi tiliga tarjima qilinadi', () async {
    try {
      await repository.requestOtp('+99871${random.nextInt(9000000) + 1000000}');
      fail('xato kutilgan edi');
    } on ApiException catch (error) {
      final message = localizeError(error);
      // Server matni emas, bizning tarjimamiz qaytishi kerak
      expect(message, isNotEmpty);
      expect(message, isNot(contains('must be')));
    }
  });
}

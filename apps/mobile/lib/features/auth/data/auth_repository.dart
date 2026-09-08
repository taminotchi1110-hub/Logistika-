import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../core/api/api_client.dart';
import '../../../core/storage/token_storage.dart';
import '../domain/user.dart';

/// Autentifikatsiya bilan ishlash.
class AuthRepository {
  AuthRepository({required ApiClient api, required TokenStorage storage})
      : _api = api,
        _storage = storage;

  final ApiClient _api;
  final TokenStorage _storage;

  /// SMS kod so'rash.
  ///
  /// `skipAuth: true` — bu endpoint token talab qilmaydi va eski
  /// (eskirgan) tokenni yuborish keraksiz 401 keltirib chiqaradi.
  Future<OtpChallenge> requestOtp(String phone) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/auth/otp/request',
      body: {'phone': phone},
      skipAuth: true,
    );
    return OtpChallenge.fromJson(phone, data);
  }

  /// Kodni tasdiqlash. Muvaffaqiyatda tokenlar saqlanadi.
  Future<({AppUser user, bool isNewUser})> verifyOtp({
    required String phone,
    required String code,
  }) async {
    final device = await _deviceInfo();

    final data = await _api.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      body: {'phone': phone, 'code': code, 'device': device},
      skipAuth: true,
    );

    final user = AppUser.fromJson(data['user'] as Map<String, dynamic>);

    await _storage.saveTokens(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
      userId: user.id,
    );

    return (user: user, isNewUser: data['isNewUser'] as bool? ?? false);
  }

  /// Ro'yxatdan o'tgandan keyin profilni to'ldirish.
  Future<AppUser> completeProfile({
    required String firstName,
    required String lastName,
    required UserRole role,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/auth/profile',
      body: {'firstName': firstName, 'lastName': lastName, 'role': role.api},
    );
    return AppUser.fromJson(data);
  }

  Future<AppUser> me() async {
    final data = await _api.get<Map<String, dynamic>>('/me');
    return AppUser.fromJson(data);
  }

  Future<AppUser> updateProfile({
    String? firstName,
    String? lastName,
    String? lang,
    String? avatarKey,
  }) async {
    final data = await _api.patch<Map<String, dynamic>>(
      '/me',
      body: {
        if (firstName != null) 'firstName': firstName,
        if (lastName != null) 'lastName': lastName,
        if (lang != null) 'lang': lang,
        if (avatarKey != null) 'avatarKey': avatarKey,
      },
    );
    return AppUser.fromJson(data);
  }

  /// Chiqish.
  ///
  /// Server xato qaytarsa ham LOKAL tokenlar o'chiriladi: foydalanuvchi
  /// "chiqish" tugmasini bosgan bo'lsa, ilova albatta chiqishi kerak.
  /// Aks holda internetsiz joyda chiqib bo'lmaydi.
  Future<void> logout() async {
    try {
      await _api.post<dynamic>('/auth/logout');
    } catch (_) {
      // Ataylab yutiladi
    } finally {
      await _storage.clear();
    }
  }

  /// Push uchun qurilma tokenini ro'yxatdan o'tkazish.
  Future<void> registerDevice({
    required String fcmToken,
    required String deviceId,
    required String platform,
  }) async {
    await _api.put<dynamic>(
      '/me/devices',
      body: {'fcmToken': fcmToken, 'deviceId': deviceId, 'platform': platform},
    );
  }

  /// Qurilma ma'lumoti — sessiyalar ro'yxatida ko'rsatiladi
  /// ("Samsung Galaxy A54, 8 sentyabr").
  ///
  /// HECH QANDAY XATO KIRISHNI TO'XTATMASLIGI KERAK.
  ///
  /// Bu ma'lumot qulaylik uchun: foydalanuvchi o'z sessiyalarini
  /// tanishi oson bo'lsin. Agar platforma kanali javob bermasa
  /// (eski qurilma, cheklangan muhit, plagin yangilanishi), kirish
  /// baribir ishlashi shart. Ilgari `PackageInfo.fromPlatform()`
  /// `try` blokidan TASHQARIDA edi va uning yiqilishi butun kirish
  /// oqimini to'xtatardi.
  Future<Map<String, dynamic>> _deviceInfo() async {
    final version = await _appVersion();

    try {
      final android = await DeviceInfoPlugin().androidInfo;
      return {
        'platform': 'android',
        'appVersion': version,
        'deviceId': android.id,
        'model': '${android.manufacturer} ${android.model}',
      };
    } catch (_) {
      // Android emas — iOS'ni sinab ko'ramiz
    }

    try {
      final ios = await DeviceInfoPlugin().iosInfo;
      return {
        'platform': 'ios',
        'appVersion': version,
        'deviceId': ios.identifierForVendor ?? 'unknown',
        'model': ios.utsname.machine,
      };
    } catch (_) {
      // Noma'lum platforma yoki kanal mavjud emas
    }

    // `platform` UMUMAN YUBORILMAYDI.
    //
    // Backend uni `android | ios | web` deb cheklaydi va `'unknown'`
    // validatsiyadan o'tmaydi — ya'ni qurilmani aniqlab bo'lmagan
    // holatda KIRISH BUTUNLAY ISHLAMAY QOLARDI. Maydon ixtiyoriy,
    // shuning uchun uni tashlab yuborish to'g'ri yechim.
    return {'appVersion': version};
  }

  Future<String> _appVersion() async {
    try {
      return (await PackageInfo.fromPlatform()).version;
    } catch (_) {
      return 'unknown';
    }
  }
}

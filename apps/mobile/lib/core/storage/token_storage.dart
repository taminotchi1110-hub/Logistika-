import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Tokenlarni saqlash.
///
/// FAQAT `flutter_secure_storage`: Android'da Keystore, iOS'da Keychain.
/// `SharedPreferences` oddiy XML fayl — root qilingan qurilmada yoki
/// zaxira nusxadan o'qib olish mumkin. Token esa akkauntga to'liq
/// kirish huquqini beradi.
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  static const _userIdKey = 'user_id';

  Future<String?> readAccessToken() => _storage.read(key: _accessKey);
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);
  Future<String?> readUserId() => _storage.read(key: _userIdKey);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    String? userId,
  }) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
    if (userId != null) {
      await _storage.write(key: _userIdKey, value: userId);
    }
  }

  Future<bool> hasSession() async => (await readRefreshToken()) != null;

  /// Chiqishda va sessiya bekor qilinganda.
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _userIdKey);
  }
}

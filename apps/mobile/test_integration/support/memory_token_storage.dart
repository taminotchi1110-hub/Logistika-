import 'package:karvon/core/storage/token_storage.dart';

/// Xotiradagi token saqlagich.
///
/// Haqiqiy `TokenStorage` platforma kanallarini (Android Keystore /
/// iOS Keychain) ishlatadi va test muhitida ishlamaydi. Bu voris
/// faqat xotirada saqlaydi — testlar bir-biridan mustaqil bo'ladi.
class MemoryTokenStorage extends TokenStorage {
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

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/reference_data.dart';

/// Spravochniklarni yuklaydi va LOKAL SAQLAYDI.
///
/// NEGA KESH KERAK:
///   1. Spravochnik har bir ilova ochilishida kerak bo'ladi — yuk
///      yaratish, filtr, transport qo'shish, hammasi shunga tayanadi.
///      Har safar 40 KB yuklash mobil internetda sezilarli kechikish.
///   2. Metro yoki qishloqda internet yo'q bo'lishi mumkin. Kesh
///      bo'lmasa, yuk e'lon qilish formasi umuman ochilmaydi.
///
/// SERVER `version` HASH BERADI: mijoz o'zidagi versiyani yuboradi va
/// o'zgarish bo'lmasa server bir necha baytlik javob qaytaradi. Ya'ni
/// ilova har ochilishda yangilikni tekshiradi, lekin trafik sarflamaydi.
class ReferenceRepository {
  ReferenceRepository(this._api, {SharedPreferences? preferences})
      : _preferences = preferences;

  static const _cacheKey = 'reference.bundle.v1';

  final ApiClient _api;
  SharedPreferences? _preferences;

  Future<SharedPreferences> get _prefs async =>
      _preferences ??= await SharedPreferences.getInstance();

  /// To'plamni oladi: keshdan o'qiydi, so'ng serverdan yangilanishni tekshiradi.
  ///
  /// Tarmoq yo'q bo'lsa keshdagi nusxa qaytadi — bu kutilgan holat, xato emas.
  /// Kesh ham bo'lmasa xato ko'tariladi: bo'sh spravochnik bilan forma
  /// ko'rsatish foydalanuvchini chalg'itadi.
  Future<ReferenceBundle> load({bool forceRefresh = false}) async {
    final cached = forceRefresh ? null : await _readCache();

    try {
      final response = await _api.get<Map<String, dynamic>>(
        '/reference/all',
        query: {if (cached != null) 'version': cached.version},
      );

      // O'zgarish yo'q — keshdagi nusxa hali to'g'ri
      if (response['changed'] == false && cached != null) return cached;

      final bundle = ReferenceBundle.fromJson(response);
      await _writeCache(response, bundle.version);
      return bundle;
    } on ApiException {
      if (cached != null) return cached;
      // Kesh yo'q: tarmoq xatosini o'zgartirmasdan yuqoriga uzatamiz —
      // UI uni "internetga ulaning" deb ko'rsatadi
      rethrow;
    }
  }

  /// Keshdagi nusxa (bo'lsa). Buzilgan JSON — kesh yo'q deb hisoblanadi.
  Future<ReferenceBundle?> _readCache() async {
    try {
      final raw = (await _prefs).getString(_cacheKey);
      if (raw == null) return null;

      final bundle = ReferenceBundle.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      // Eski ilova versiyasidan qolgan chala to'plam foyda bermaydi
      return bundle.isEmpty ? null : bundle;
    } on Object {
      return null;
    }
  }

  Future<void> _writeCache(Map<String, dynamic> payload, String version) async {
    if (version.isEmpty) return;

    try {
      await (await _prefs).setString(_cacheKey, jsonEncode(payload));
    } on Object {
      // Diskda joy yo'q bo'lsa ilova ishlashda davom etadi — keshsiz,
      // lekin ishlaydi. Bu yerda xato ko'tarish foydasiz.
    }
  }

  /// Testlar va "chiqish" uchun.
  Future<void> clearCache() async => (await _prefs).remove(_cacheKey);
}

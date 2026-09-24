import '../../../core/api/api_client.dart';
import '../../auth/domain/user.dart';
import '../domain/driver_readiness.dart';

class ProfileRepository {
  ProfileRepository(this._api);

  final ApiClient _api;

  Future<AppUser> updateProfile({
    String? firstName,
    String? lastName,
    String? lang,
  }) async {
    final data = await _api.patch<Map<String, dynamic>>(
      '/me',
      body: {
        if (firstName != null) 'firstName': firstName.trim(),
        if (lastName != null) 'lastName': lastName.trim(),
        if (lang != null) 'lang': lang,
      },
    );
    return AppUser.fromJson(data);
  }

  /// Haydovchining tayyorligi — nima yetishmayapti.
  Future<DriverReadiness> readiness() async {
    final data = await _api.get<Map<String, dynamic>>('/me/driver/readiness');
    return DriverReadiness.fromJson(data);
  }

  /// Verifikatsiyaga yuborish.
  ///
  /// Hujjatlar va transport joyida bo'lgach admin ko'rib chiqadi.
  /// Bir marta yuborilgach qayta yuborish kerak emas.
  Future<DriverReadiness> submitVerification() async {
    final data = await _api.post<Map<String, dynamic>>('/me/driver/submit-verification');
    return DriverReadiness.fromJson(data);
  }

  /// Bandlik holati: `AVAILABLE` / `BUSY` / `OFFLINE`.
  ///
  /// OFLAYN HAYDOVCHI MATCHINGGA TUSHMAYDI — dam olayotgan odamga
  /// yuk taklif qilish uni bezovta qiladi va bildirishnomalarni
  /// o'chirishga majbur qiladi.
  Future<void> setAvailability(String availability) async {
    await _api.patch<dynamic>(
      '/me/driver/availability',
      body: {'availability': availability},
    );
  }

  Future<List<DriverRoute>> routes() async {
    final data = await _api.get<List<dynamic>>('/me/driver/routes');
    return data
        .map((item) => DriverRoute.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Yo'nalish qo'shadi va YANGILANGAN ro'yxatni qaytaradi.
  ///
  /// Server to'liq ro'yxatni qaytaradi — mijoz tomonida qo'shish
  /// mantiqini takrorlash shart emas (limit, dublikat tekshiruvi
  /// serverda).
  Future<List<DriverRoute>> addRoute({
    required int fromRegionId,
    int? toRegionId,
    bool isRegular = false,
  }) async {
    final data = await _api.post<List<dynamic>>(
      '/me/driver/routes',
      body: {
        'fromRegionId': fromRegionId,
        if (toRegionId != null) 'toRegionId': toRegionId,
        if (isRegular) 'isRegular': true,
      },
    );

    return data
        .map((item) => DriverRoute.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<void> removeRoute(String id) async {
    await _api.delete<dynamic>('/me/driver/routes/$id');
  }

  /// "Ma'lumotlarimning nusxasi" — maxfiylik siyosatining 7-bo'limidagi huquq.
  ///
  /// Server tokenlarni, shifrlangan hujjat raqamlarini va ikkinchi
  /// tomonning to'liq telefon raqamini kiritmaydi — fayl foydalanuvchi
  /// qo'lidan chiqib ketsa ham ular bilan hech narsa qilib bo'lmaydi.
  Future<Map<String, dynamic>> exportData() async {
    return _api.get<Map<String, dynamic>>('/me/export');
  }

  /// Hisobni butunlay o'chiradi (App Store va Google Play talabi).
  ///
  /// Server ochiq buyurtma, hamyon qoldig'i yoki kutilayotgan pul yechish
  /// bo'lsa rad etadi (409) — sabab kod bilan keladi va tarjima qilinadi.
  /// Muvaffaqiyatli bo'lsa barcha sessiyalar serverda allaqachon yopilgan.
  Future<void> deleteAccount() async {
    await _api.delete<dynamic>('/me');
  }
}

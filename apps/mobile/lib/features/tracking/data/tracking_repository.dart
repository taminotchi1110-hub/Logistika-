import '../../../core/api/api_client.dart';
import '../../../core/utils/polyline.dart';
import '../domain/live_location.dart';

class TrackingRepository {
  TrackingRepository(this._api);

  final ApiClient _api;

  /// Buyurtmaning oxirgi joylashuvi.
  ///
  /// `null` — kuzatuv hali boshlanmagan yoki tugagan. Bu XATO EMAS:
  /// haydovchi yoʻlga chiqmaguncha joylashuv yozilmaydi.
  Future<LiveLocation?> lastLocation(String orderId) async {
    final data = await _api.get<Map<String, dynamic>?>('/orders/$orderId/location');
    if (data == null || data.isEmpty) return null;
    return LiveLocation.fromJson(data);
  }

  /// Bosib oʻtilgan yoʻl — xaritada bitta chiziq.
  Future<OrderTrack> track(String orderId) async {
    final data = await _api.get<Map<String, dynamic>>('/orders/$orderId/track');
    final points = decodePolyline(data['polyline'] as String? ?? '');
    return OrderTrack.fromJson(data, points);
  }

  /// Joylashuv yuborish — REST zaxira yoʻli.
  ///
  /// Asosiy yoʻl WebSocket (`location:update`). Bu endpoint aloqa
  /// uzilib qayta tiklanganda buferdagi nuqtalarni TOʻPLAM bilan
  /// yuborish uchun: har birini alohida yuborish tunnelldan chiqqan
  /// haydovchida oʻnlab soʻrov hosil qiladi.
  ///
  /// Qaytaradi: marshrut tarixi YOZILDIMI. Faol reys boʻlmasa server
  /// `false` qaytaradi va nuqtalar tarixga tushmaydi — bu maxfiylik
  /// qoidasi, xato emas. Matching keshi esa baribir yangilanadi.
  Future<bool> sendPoints(List<Map<String, dynamic>> points) async {
    if (points.isEmpty) return false;

    final data = await _api.post<Map<String, dynamic>>(
      '/me/driver/location',
      body: {'points': points},
    );
    return data['tracking'] as bool? ?? false;
  }
}

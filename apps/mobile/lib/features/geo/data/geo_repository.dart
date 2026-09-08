import '../../../core/api/api_client.dart';
import '../domain/place.dart';

class GeoRepository {
  GeoRepository(this._api);

  final ApiClient _api;

  /// Manzil qidirish (avtokomplit).
  ///
  /// Backend natijalarni 24 soat keshlaydi — bir xil so'rov tashqi
  /// provayderga qayta ketmaydi. Shuning uchun mijoz tomonda
  /// keshlash shart emas, faqat debounce yetarli.
  Future<List<Place>> search(String query, {int limit = 8}) async {
    // Server 3 belgidan qisqa so'rovni rad etadi — bekorga so'rov
    // yubormaymiz va foydalanuvchiga xato ko'rsatmaymiz
    if (query.trim().length < 3) return const [];

    final data = await _api.get<List<dynamic>>(
      '/geo/search',
      query: {'q': query.trim(), 'limit': limit},
    );

    return data
        .map((item) => Place.fromJson(item as Map<String, dynamic>))
        .where((place) => place.isValid)
        .toList();
  }

  /// Koordinatadan manzil — xaritadan pin qo'yilganda yoki
  /// "mening joylashuvim" tanlanganda.
  Future<Place> reverse({required double lat, required double lng}) async {
    final data = await _api.get<Map<String, dynamic>>(
      '/geo/reverse',
      query: {'lat': lat, 'lng': lng},
    );

    final place = Place.fromJson(data);
    // Manzil topilmasa ham koordinata to'g'ri — foydalanuvchiga
    // hech bo'lmasa viloyat nomini ko'rsatamiz
    if (place.label.isEmpty) {
      return Place(
        label: place.regionName ?? 'Xaritadagi nuqta',
        lat: lat,
        lng: lng,
        regionId: place.regionId,
        regionName: place.regionName,
      );
    }
    return place;
  }
}

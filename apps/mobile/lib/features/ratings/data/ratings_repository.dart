import '../../../core/api/api_client.dart';
import '../domain/rating.dart';

class RatingsRepository {
  RatingsRepository(this._api);

  final ApiClient _api;

  Future<Rating> submit(String orderId, RatingDraft draft) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/orders/$orderId/rating',
      body: draft.toJson(),
    );
    return Rating.fromJson(data);
  }

  /// Buyurtma baholari.
  ///
  /// O'z bahongiz har doim ko'rinadi, hamkorniki — ochilgandan keyin.
  /// Filtrlashni SERVER qiladi: mijoz tomonida yashirish qoidani
  /// chetlab o'tish yo'lini ochardi (javobda ma'lumot baribir bo'lardi).
  Future<List<Rating>> forOrder(String orderId) async {
    final data = await _api.get<List<dynamic>>('/orders/$orderId/ratings');
    return data
        .map((item) => Rating.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Baho kutayotgan buyurtmalar — eslatma uchun.
  Future<List<PendingRating>> pending() async {
    final data = await _api.get<List<dynamic>>('/me/ratings/pending');
    return data
        .map((item) => PendingRating.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Ochiq profildagi baholar — faqat ochilganlari.
  Future<List<Rating>> forUser(String userId) async {
    final data = await _api.get<List<dynamic>>('/users/$userId/ratings');
    return data
        .map((item) => Rating.fromJson(item as Map<String, dynamic>))
        .toList();
  }
}

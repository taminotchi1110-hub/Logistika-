import '../../../core/api/api_client.dart';
import '../domain/order.dart';

class OrdersRepository {
  OrdersRepository(this._api);

  final ApiClient _api;

  /// Buyurtmalar ro'yxati.
  ///
  /// SAHIFALASH YO'Q — ataylab. Bir foydalanuvchida bir vaqtda bitta
  /// faol reys bo'ladi, tarix esa o'nlab. Kursor qo'shish murakkablik
  /// qo'shadi, foyda bermaydi. Tarix kattalashsa server tomondan
  /// sahifalash qo'shiladi va mijoz o'sha paytda yangilanadi.
  Future<List<Order>> list({bool? active}) async {
    final data = await _api.get<List<dynamic>>(
      '/orders',
      query: {if (active != null) 'active': active},
    );

    return data
        .map((item) => Order.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<Order> byId(String id) async {
    final data = await _api.get<Map<String, dynamic>>('/orders/$id');
    return Order.fromJson(data);
  }

  /// Holat o'zgartirish.
  ///
  /// `lat`/`lng` BERILADI: nizoda "qayerda turib bosgan" savoliga javob
  /// shu koordinata bo'ladi. Joylashuv olinmasa ham o'tish bajariladi —
  /// GPS o'chiq bo'lgani reysni to'xtatib qo'ymasligi kerak.
  Future<Order> changeStatus(
    String id,
    OrderStatus status, {
    String? note,
    double? lat,
    double? lng,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/orders/$id/status',
      body: {
        'status': status.apiValue,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      },
    );
    return Order.fromJson(data);
  }

  Future<List<OrderHistoryEntry>> history(String id) async {
    final data = await _api.get<List<dynamic>>('/orders/$id/history');
    return data
        .map((item) => OrderHistoryEntry.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Favqulodda kontakt ochish — "Bogʻlana olmayapman".
  ///
  /// Sabab MAJBURIY va audit jurnaliga yoziladi: bu qoidani chetlab
  /// o'tish yo'li emas, istisno holat uchun klapan. Ikkala tomonga
  /// bildirishnoma ketadi.
  Future<Order> revealContacts(String id, String reason) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/orders/$id/reveal-contacts',
      body: {'reason': reason.trim()},
    );
    return Order.fromJson(data);
  }
}

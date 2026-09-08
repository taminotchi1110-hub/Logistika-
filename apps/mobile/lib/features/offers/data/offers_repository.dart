import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/providers.dart';
import '../domain/offer.dart';

class OffersRepository {
  OffersRepository(this._api);

  final ApiClient _api;

  /// Haydovchi taklif yuboradi.
  ///
  /// `offeredPriceTiyin` berilmasa — e'lon narxi bo'yicha rozilik.
  Future<Offer> send({
    required String loadId,
    required String vehicleId,
    String? offeredPriceTiyin,
    String? message,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/loads/$loadId/offers',
      body: {
        'vehicleId': vehicleId,
        // Backend `number` kutadi (BIGINT emas): narx 9 mlrd tiyingacha
        // sig'adi va bu 90 mln so'm — bitta buyurtma uchun yetarli
        if (offeredPriceTiyin != null) 'offeredPriceTiyin': int.parse(offeredPriceTiyin),
        if (message != null && message.isNotEmpty) 'message': message,
      },
    );
    return Offer.fromJson(data);
  }

  /// Yuk egasi uchun takliflar ro'yxati.
  Future<List<Offer>> forLoad(String loadId) async {
    final data = await _api.get<List<dynamic>>('/loads/$loadId/offers');
    return data.map((item) => Offer.fromJson(item as Map<String, dynamic>)).toList();
  }

  /// Haydovchining o'z takliflari.
  Future<List<Offer>> mine() async {
    final data = await _api.get<List<dynamic>>('/offers/mine');
    return data.map((item) => Offer.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<void> withdraw(String offerId) async {
    await _api.post<dynamic>('/offers/$offerId/withdraw');
  }

  Future<void> reject(String offerId) async {
    await _api.post<dynamic>('/offers/$offerId/reject');
  }

  /// Yuk egasi taklifni qabul qiladi — buyurtma yaratiladi.
  Future<Map<String, dynamic>> accept(String offerId) async {
    return _api.post<Map<String, dynamic>>('/offers/$offerId/accept');
  }
}

final offersRepositoryProvider = Provider<OffersRepository>((ref) {
  return OffersRepository(ref.watch(apiClientProvider));
});

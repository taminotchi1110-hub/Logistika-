import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/providers.dart';
import '../domain/vehicle.dart';

class VehiclesRepository {
  VehiclesRepository(this._api);

  final ApiClient _api;

  Future<List<Vehicle>> mine() async {
    final data = await _api.get<List<dynamic>>('/vehicles');
    return data.map((item) => Vehicle.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<Vehicle> create(Map<String, dynamic> body) async {
    final data = await _api.post<Map<String, dynamic>>('/vehicles', body: body);
    return Vehicle.fromJson(data);
  }
}

final vehiclesRepositoryProvider = Provider<VehiclesRepository>((ref) {
  return VehiclesRepository(ref.watch(apiClientProvider));
});

/// Haydovchining transportlari.
///
/// `autoDispose` ATAYLAB ISHLATILMAYDI: ro'yxat kichik va u taklif
/// yuborish oynasida har safar kerak bo'ladi. Qayta yuklab o'tirish
/// foydalanuvchini kutdiradi.
final myVehiclesProvider = FutureProvider<List<Vehicle>>((ref) {
  return ref.watch(vehiclesRepositoryProvider).mine();
});

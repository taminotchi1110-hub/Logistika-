import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/ratings_repository.dart';
import '../domain/rating.dart';

final ratingsRepositoryProvider = Provider<RatingsRepository>((ref) {
  return RatingsRepository(ref.watch(apiClientProvider));
});

/// Baho kutayotgan buyurtmalar.
///
/// Ro'yxatning o'zi eslatma manbai: ilova uni bosh ekranda ko'rsatadi.
/// Muddati o'tganlari serverdan kelmaydi — mijoz tomonida sana
/// tekshirish shart emas.
final pendingRatingsProvider = FutureProvider<List<PendingRating>>((ref) {
  return ref.watch(ratingsRepositoryProvider).pending();
});

/// Buyurtma baholari.
final orderRatingsProvider =
    FutureProvider.family<List<Rating>, String>((ref, orderId) {
  return ref.watch(ratingsRepositoryProvider).forOrder(orderId);
});

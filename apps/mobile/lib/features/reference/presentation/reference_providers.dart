import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/reference_repository.dart';
import '../domain/reference_data.dart';

final referenceRepositoryProvider = Provider<ReferenceRepository>((ref) {
  return ReferenceRepository(ref.watch(apiClientProvider));
});

/// Spravochnik to'plami.
///
/// `keepAlive: true` emas — Riverpod'ning `FutureProvider` natijasi
/// provayder kuzatilayotgan vaqtda saqlanadi va bu bizga yetarli:
/// asosiy ekran ochiq turganda hech qachon qayta so'ralmaydi.
/// Haqiqiy uzoq muddatli saqlash `SharedPreferences` da.
final referenceProvider = FutureProvider<ReferenceBundle>((ref) {
  return ref.watch(referenceRepositoryProvider).load();
});

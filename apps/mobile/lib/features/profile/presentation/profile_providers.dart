import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/profile_repository.dart';
import '../domain/driver_readiness.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.watch(apiClientProvider));
});

/// Haydovchining tayyorligi.
///
/// Faqat haydovchi uchun so'raladi: mijozda bu endpoint 403 qaytaradi
/// va provayder xatoga tushib qolardi.
final driverReadinessProvider = FutureProvider<DriverReadiness?>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null || !user.role.canDrive) return null;

  return ref.watch(profileRepositoryProvider).readiness();
});

final driverRoutesProvider = FutureProvider<List<DriverRoute>>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null || !user.role.canDrive) return const [];

  return ref.watch(profileRepositoryProvider).routes();
});

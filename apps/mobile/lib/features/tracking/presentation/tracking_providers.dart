import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/location/device_location.dart';
import '../../../core/providers.dart';
import '../../../core/ws/ws_providers.dart';
import '../../orders/domain/order.dart';
import '../../orders/presentation/orders_screen.dart';
import '../data/location_sender.dart';
import 'tracking_screen.dart' show trackingRepositoryProvider;

/// Haydovchining joylashuv yuboruvchisi — ilova bo'ylab bitta.
final locationSenderProvider = Provider<DriverLocationSender>((ref) {
  final sender = DriverLocationSender(
    socket: ref.watch(socketClientProvider),
    repository: ref.watch(trackingRepositoryProvider),
    resolver: ref.watch(locationResolverProvider),
  );

  ref.onDispose(sender.stop);
  return sender;
});

/// Hozir kuzatuv talab qiladigan reys (haydovchi uchun).
///
/// NEGA FAOL BUYURTMALARDAN: haydovchi "Yo'lga chiqdim" tugmasini
/// bosgach kuzatuv boshlanishi va u boshqa ekranga o'tsa ham DAVOM
/// ETISHI kerak. Agar kuzatuv faqat xarita ekranida ishlaganida,
/// mijoz haydovchi ilovani yopgani bilan uni yo'qotgan bo'lardi.
///
/// `null` — kuzatiladigan reys yo'q: sender to'xtaydi.
final trackedOrderIdProvider = Provider<String?>((ref) {
  final user = ref.watch(currentUserProvider);
  // Faqat haydovchi joylashuv yuboradi
  if (user == null || !user.role.canDrive) return null;

  final orders = ref.watch(activeOrdersProvider).valueOrNull ?? const <Order>[];

  for (final order in orders) {
    // Kuzatuv chegarasi backend bilan bir xil: EN_ROUTE_TO_PICKUP dan
    // ARRIVED_AT_DELIVERY gacha
    if (order.status.isTracking) return order.id;
  }
  return null;
});

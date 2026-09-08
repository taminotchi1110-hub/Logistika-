import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'socket_client.dart';

/// Yagona WebSocket ulanishi.
///
/// NEGA BITTA: Socket.IO ulanishi qimmat (handshake, autentifikatsiya,
/// Redis xonalari). Har bir ekran o'z ulanishini ochsa, server tomonda
/// bitta foydalanuvchi uchun bir nechta sessiya paydo bo'ladi va
/// xabarlar takrorlanadi.
final socketClientProvider = Provider<SocketClient>((ref) {
  final client = SocketClient(ref.watch(tokenStorageProvider));
  ref.onDispose(client.dispose);
  return client;
});

/// Serverdan kelayotgan bildirishnomalar oqimi (banner uchun).
final realtimeNotificationsProvider = StreamProvider<RealtimeNotification>((ref) {
  return ref.watch(socketClientProvider).notifications;
});

/// Chat xabarlari oqimi.
final realtimeMessagesProvider = StreamProvider<RealtimeMessage>((ref) {
  return ref.watch(socketClientProvider).messages;
});

/// Jonli joylashuv oqimi (kuzatuv ekrani uchun).
final realtimeLocationsProvider = StreamProvider<RealtimeLocation>((ref) {
  return ref.watch(socketClientProvider).locations;
});

/// Ulanish holati.
///
/// Chat ekranida ko'rsatiladi: aloqa uzilganda foydalanuvchi buni
/// bilishi kerak, aks holda javob kelmaganini "hamkor javob bermayapti"
/// deb tushunadi.
final socketConnectedProvider = StreamProvider<bool>((ref) {
  return ref.watch(socketClientProvider).connectionState;
});

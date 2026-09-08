import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/chat_repository.dart';
import '../domain/conversation.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepository(ref.watch(apiClientProvider));
});

/// Suhbatlar ro'yxati.
///
/// Yangi xabar kelganda `ref.invalidate` bilan yangilanadi — oxirgi
/// xabar va o'qilmaganlar soni serverdan qayta olinadi. Ro'yxatni
/// mijoz tomonida yig'ish murakkab va xatoga moyil: bir xil xabar
/// WebSocket'dan ham, REST'dan ham kelishi mumkin.
final conversationsProvider = FutureProvider<List<Conversation>>((ref) {
  return ref.watch(chatRepositoryProvider).conversations();
});

/// Barcha suhbatlardagi o'qilmagan xabarlar soni — pastki
/// navigatsiyadagi belgi uchun.
final unreadTotalProvider = Provider<int>((ref) {
  final conversations = ref.watch(conversationsProvider).valueOrNull ?? const [];
  return conversations.fold(0, (sum, item) => sum + item.unreadCount);
});

/// Hozir ochiq turgan suhbat.
///
/// Banner shu suhbatdan kelgan xabar uchun KO'RSATILMAYDI: foydalanuvchi
/// xabarni ro'yxatda ko'rib turibdi va ekran ustidan sirg'aluvchi
/// nusxa faqat xalaqit beradi.
final openConversationProvider = StateProvider<String?>((ref) => null);

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/ws/socket_client.dart';
import 'core/ws/ws_providers.dart';
import 'features/chat/presentation/chat_providers.dart';
import 'shared/widgets/notification_banner.dart';

class KarvonApp extends ConsumerWidget {
  const KarvonApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'KARVON',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      // Qorong'i mavzu keyingi bosqichda: haydovchi kechasi ishlaydi va
      // yorqin ekran ko'zni charchatadi
      themeMode: ThemeMode.light,
      routerConfig: router,
      builder: (context, child) {
        // Tizim shrift o'lchamini cheklaymiz: 200% da interfeys buziladi.
        // 130% gacha ruxsat — bu yoshi katta foydalanuvchilar uchun yetarli.
        final scale = MediaQuery.textScalerOf(context).clamp(
          minScaleFactor: 1,
          maxScaleFactor: 1.3,
        );
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: scale),
          child: _RealtimeHost(
            router: router,
            child: child ?? const SizedBox.shrink(),
          ),
        );
      },
    );
  }
}

/// WebSocket ulanishi va bildirishnoma banneri.
///
/// NEGA ILOVA ILDIZIDA (har bir ekranda emas): ulanish bitta bo'lishi
/// kerak va banner istalgan ekranda ko'rinishi kerak. Chat ekranida
/// turgan foydalanuvchi ham boshqa suhbatdan kelgan xabarni ko'radi.
///
/// `Overlay` shu daraxtda mavjud: `MaterialApp.router` ning `builder`
/// i `Navigator` ostida chaqiriladi.
class _RealtimeHost extends ConsumerStatefulWidget {
  const _RealtimeHost({required this.router, required this.child});

  final GoRouter router;
  final Widget child;

  @override
  ConsumerState<_RealtimeHost> createState() => _RealtimeHostState();
}

class _RealtimeHostState extends ConsumerState<_RealtimeHost> {
  @override
  void initState() {
    super.initState();
    // Ilova ochilganda sessiya bo'lsa darhol ulanamiz
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncConnection());
  }

  void _syncConnection() {
    final status = ref.read(authStateProvider).status;
    final socket = ref.read(socketClientProvider);

    if (status == AuthStatus.authenticated) {
      socket.connect();
    } else {
      socket.disconnect();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Kirish holati o'zgarsa ulanamiz yoki uzamiz
    ref.listen(authStateProvider, (previous, next) {
      if (previous?.status != next.status) _syncConnection();
    });

    ref.listen(realtimeNotificationsProvider, (previous, next) {
      final notification = next.valueOrNull;
      if (notification == null) return;
      _onNotification(notification);
    });

    return widget.child;
  }

  void _onNotification(RealtimeNotification notification) {
    // Chat xabari — ro'yxatdagi "o'qilmagan" belgisi yangilanadi
    if (notification.isChat) ref.invalidate(conversationsProvider);

    NotificationBanner.show(
      context,
      notification,
      // Foydalanuvchi allaqachon shu suhbatda bo'lsa banner ortiqcha:
      // xabar ro'yxatda ko'rinib turibdi
      suppressFor: ref.read(openConversationProvider),
      onTap: _openDeepLink,
    );
  }

  /// `karvon://order/<id>` yoki `karvon://load/<id>` → ilova ichidagi yo'l.
  void _openDeepLink(String deepLink) {
    final uri = Uri.tryParse(deepLink);
    if (uri == null) return;

    final segments = [uri.host, ...uri.pathSegments].where((s) => s.isNotEmpty);
    if (segments.isEmpty) return;

    widget.router.push('/${segments.join('/')}');
  }
}

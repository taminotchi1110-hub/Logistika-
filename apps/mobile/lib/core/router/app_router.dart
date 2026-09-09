import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/domain/user.dart';
import '../../features/auth/presentation/blocked_screen.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/phone_screen.dart';
import '../../features/auth/presentation/profile_setup_screen.dart';
import '../../features/chat/domain/conversation.dart';
import '../../features/chat/presentation/chat_screen.dart';
import '../../features/home/presentation/home_shell.dart';
import '../../features/home/presentation/splash_screen.dart';
import '../../features/loads/presentation/create_load_screen.dart';
import '../../features/loads/presentation/load_detail_screen.dart';
import '../../features/orders/presentation/order_detail_screen.dart';
import '../../features/tracking/presentation/tracking_screen.dart';
import '../providers.dart';

/// Navigatsiya.
///
/// YO'NALTIRISH BITTA JOYDA (`redirect`): har bir ekranda "kirganmi?"
/// tekshiruvi yozilsa, bittasi unutiladi va himoya teshigi paydo
/// bo'ladi. Bu yerda esa qoida bitta va u BARCHA marshrutlarga
/// qo'llanadi.
final routerProvider = Provider<GoRouter>((ref) {
  // `refreshListenable` — auth holati o'zgarganda router qayta
  // hisoblanadi va foydalanuvchi kerakli ekranga o'tadi
  final notifier = ValueNotifier<AuthStatus>(AuthStatus.unknown);

  ref.listen(authStateProvider, (previous, next) {
    notifier.value = next.status;
  });

  ref.onDispose(notifier.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: notifier,
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),

      // --- autentifikatsiya ---
      GoRoute(
        path: '/auth/phone',
        builder: (context, state) => const PhoneScreen(),
      ),
      GoRoute(
        path: '/auth/otp',
        builder: (context, state) {
          final challenge = state.extra as OtpChallenge?;
          // To'g'ridan-to'g'ri havola orqali kelinsa, ma'lumot yo'q —
          // boshidan boshlaymiz
          if (challenge == null) return const PhoneScreen();
          return OtpScreen(challenge: challenge);
        },
      ),
      GoRoute(
        path: '/auth/profile',
        builder: (context, state) => const ProfileSetupScreen(),
      ),
      GoRoute(
        path: '/blocked',
        builder: (context, state) => const BlockedScreen(),
      ),

      // --- asosiy ---
      GoRoute(
        path: '/',
        builder: (context, state) => const HomeShell(),
        routes: [
          // `load/new` `load/:id` DAN OLDIN turishi shart: aks holda
          // "new" identifikator deb qabul qilinadi va tafsilot ekrani
          // mavjud boʻlmagan yukni soʻraydi
          GoRoute(
            path: 'load/new',
            builder: (context, state) => const CreateLoadScreen(),
          ),
          // Push bildirishnomadagi karvon://load/<id> shu yerga keladi
          GoRoute(
            path: 'load/:id',
            builder: (context, state) =>
                LoadDetailScreen(loadId: state.pathParameters['id']!),
          ),
          // karvon://order/<id> — status oʻzgarishi bildirishnomasidan
          GoRoute(
            path: 'order/:id',
            builder: (context, state) =>
                OrderDetailScreen(orderId: state.pathParameters['id']!),
            routes: [
              GoRoute(
                path: 'track',
                builder: (context, state) =>
                    TrackingScreen(orderId: state.pathParameters['id']!),
              ),
            ],
          ),
          // Suhbat. `extra` — roʻyxatdan kelgan `Conversation`: sarlavha
          // va yoʻnalishni darhol koʻrsatish uchun. Push bildirishnomadan
          // kelinsa `extra` boʻlmaydi va ekran ularsiz ochiladi
          GoRoute(
            path: 'chat/:id',
            builder: (context, state) {
              final conversation = state.extra as Conversation?;
              return ChatScreen(
                conversationId: state.pathParameters['id']!,
                title: conversation?.counterpartyName,
                subtitle: conversation?.order?.route,
                canWrite: conversation?.canWrite ?? true,
              );
            },
          ),
        ],
      ),
    ],

    redirect: (context, state) {
      final status = ref.read(authStateProvider).status;
      final location = state.matchedLocation;

      final isSplash = location == '/splash';
      final isAuthFlow = location.startsWith('/auth');
      final isBlocked = location == '/blocked';

      return switch (status) {
        // Sessiya hali tekshirilmoqda — splash'da qolamiz
        AuthStatus.unknown => isSplash ? null : '/splash',

        // Kirmagan — faqat auth oqimiga ruxsat
        AuthStatus.unauthenticated => isAuthFlow ? null : '/auth/phone',

        // Kirgan, lekin profil to'ldirilmagan
        AuthStatus.needsProfile =>
          location == '/auth/profile' ? null : '/auth/profile',

        // Bloklangan akkaunt
        AuthStatus.blocked => isBlocked ? null : '/blocked',

        // To'liq kirgan — auth va splash ekranlarida turishi mumkin emas
        AuthStatus.authenticated =>
          (isSplash || isAuthFlow || isBlocked) ? '/' : null,
      };
    },

    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.link_off_rounded, size: 48),
              const SizedBox(height: 16),
              Text('Sahifa topilmadi', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(state.uri.toString(), textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => context.go('/'),
                child: const Text('Bosh sahifaga'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
});

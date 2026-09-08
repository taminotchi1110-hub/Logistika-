import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ws/socket_client.dart';

/// Ekran yuqorisidan sirg'alib chiquvchi bildirishnoma.
///
/// TALAB: "yuborilgan habar yuk beruvchiga ham haydovchiga ham ekran
/// yuqorisidan sizib chiquvchi uvidomleniya ko'rinishida chiqsin".
///
/// ILOVA OCHIQ bo'lganda tizim bildirishnomasi ko'rsatilmaydi (u faqat
/// fonda ishlaydi) — shuning uchun banner ilova ichida chiziladi.
/// Ilova yopiq bo'lsa FCM heads-up bildirishnoma keladi (backend
/// `channel` maydonini shuning uchun yuboradi).
///
/// DIZAYN QARORLARI:
///
///   1. **Status bar ustida emas, ostida.** Status bar (soat, batareya)
///      to'silmaydi — foydalanuvchi vaqtni ko'rishi kerak.
///   2. **4 soniya, keyin o'zi yo'qoladi.** Chat xabari uchun bu
///      yetarli: o'qish 2 soniya, reaksiya 2 soniya.
///   3. **Yuqoriga surib yo'qotish mumkin.** Haydovchi yo'lda — banner
///      xaritani to'sib qolmasligi kerak.
///   4. **Bosilganda tegishli ekranga o'tadi** (deep link).
///   5. **Navbat:** ketma-ket kelgan xabarlar bir-birini almashtirmaydi,
///      navbatda kutadi. Aks holda birinchi xabar o'qilmay yo'qoladi.
class NotificationBanner {
  NotificationBanner._();

  static OverlayEntry? _current;
  static Timer? _timer;
  static final _queue = <_BannerRequest>[];

  /// Bildirishnomani ko'rsatadi.
  ///
  /// `suppressFor` — ochiq ekran identifikatori. Foydalanuvchi allaqachon
  /// o'sha suhbatda bo'lsa, banner ko'rsatilmaydi: xabar chat ro'yxatida
  /// ko'rinadi va banner ortiqcha bo'ladi.
  static void show(
    BuildContext context,
    RealtimeNotification notification, {
    String? suppressFor,
    void Function(String deepLink)? onTap,
  }) {
    if (suppressFor != null && _matchesScreen(notification, suppressFor)) return;

    final request = _BannerRequest(notification: notification, onTap: onTap);

    if (_current != null) {
      // Navbatga qo'yamiz — 3 tadan ortiq to'planmasin
      if (_queue.length < 3) _queue.add(request);
      return;
    }

    _present(context, request);
  }

  static bool _matchesScreen(RealtimeNotification notification, String screenId) {
    if (notification.isChat) {
      return notification.conversationId == screenId;
    }
    return notification.entityId == screenId;
  }

  static void _present(BuildContext context, _BannerRequest request) {
    final overlay = Overlay.maybeOf(context);
    if (overlay == null) return;

    final entry = OverlayEntry(
      builder: (context) => _BannerWidget(
        notification: request.notification,
        onTap: () {
          final link = request.notification.deepLink;
          _dismiss();
          if (link != null) request.onTap?.call(link);
        },
        onDismiss: _dismiss,
      ),
    );

    _current = entry;
    overlay.insert(entry);

    _timer?.cancel();
    _timer = Timer(const Duration(seconds: 4), _dismiss);
  }

  static void _dismiss() {
    _timer?.cancel();
    _timer = null;
    _current?.remove();
    _current = null;

    // Navbatdagi keyingisini ko'rsatamiz
    if (_queue.isNotEmpty) {
      final next = _queue.removeAt(0);
      final context = _lastContext;
      if (context != null && context.mounted) {
        // Kichik pauza — ikkita banner bir-biriga yopishib qolmasin
        Timer(const Duration(milliseconds: 250), () {
          if (context.mounted) _present(context, next);
        });
      }
    }
  }

  static BuildContext? _lastContext;

  /// Ilova ildizida bir marta chaqiriladi — navbat uchun kontekst kerak.
  static void attach(BuildContext context) => _lastContext = context;
}

class _BannerRequest {
  const _BannerRequest({required this.notification, this.onTap});

  final RealtimeNotification notification;
  final void Function(String deepLink)? onTap;
}

class _BannerWidget extends StatefulWidget {
  const _BannerWidget({
    required this.notification,
    required this.onTap,
    required this.onDismiss,
  });

  final RealtimeNotification notification;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  State<_BannerWidget> createState() => _BannerWidgetState();
}

class _BannerWidgetState extends State<_BannerWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
  )..forward();

  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, -1),
    end: Offset.zero,
  ).animate(
    // `easeOutCubic` — tez boshlanib, sekin to'xtaydi. Bu tabiiy
    // harakat: banner "tushib keladi", "otilib chiqmaydi".
    CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isChat = widget.notification.channel == 'karvon_messages';
    final topPadding = MediaQuery.paddingOf(context).top;

    return Positioned(
      // Status bar ostida — soat va batareya to'silmaydi
      top: topPadding + AppSpacing.sm,
      left: AppSpacing.md,
      right: AppSpacing.md,
      child: SlideTransition(
        position: _slide,
        child: Material(
          color: Colors.transparent,
          child: Dismissible(
            key: ValueKey(widget.notification.hashCode),
            direction: DismissDirection.up,
            onDismissed: (_) => widget.onDismiss(),
            child: GestureDetector(
              onTap: widget.onTap,
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x1A000000),
                      blurRadius: 16,
                      offset: Offset(0, 4),
                    ),
                  ],
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: isChat ? AppColors.primaryLight : AppColors.accentLight,
                        borderRadius: BorderRadius.circular(AppRadius.md),
                      ),
                      child: Icon(
                        isChat
                            ? Icons.chat_bubble_rounded
                            : Icons.local_shipping_rounded,
                        size: AppSizes.iconSm,
                        color: isChat ? AppColors.primary : AppColors.accentDark,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            widget.notification.title,
                            style: theme.textTheme.titleMedium,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            widget.notification.body,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: AppColors.textSecondary,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: AppColors.gray400,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:karvon/core/l10n/formatters.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_states.dart';
import '../../ratings/presentation/rating_providers.dart';
import '../data/orders_repository.dart';
import '../domain/order.dart';
import 'widgets/order_card.dart';

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  return OrdersRepository(ref.watch(apiClientProvider));
});

/// Faol reyslar — ilovaning eng tez-tez ochiladigan ro'yxati.
///
/// `autoDispose` YO'Q: haydovchi ekranlar orasida tez-tez o'tadi
/// (lenta ↔ reys ↔ chat) va har safar qayta yuklash mobil internetda
/// sezilarli kechikish beradi.
final activeOrdersProvider = FutureProvider<List<Order>>((ref) {
  return ref.watch(ordersRepositoryProvider).list(active: true);
});

final orderHistoryProvider = FutureProvider<List<Order>>((ref) {
  return ref.watch(ordersRepositoryProvider).list(active: false);
});

/// Bitta buyurtma — tafsilot ekrani va bildirishnoma orqali kirish uchun.
final orderProvider = FutureProvider.family<Order, String>((ref, id) {
  return ref.watch(ordersRepositoryProvider).byId(id);
});

final orderHistoryEntriesProvider =
    FutureProvider.family<List<OrderHistoryEntry>, String>((ref, id) {
  return ref.watch(ordersRepositoryProvider).history(id);
});

/// Buyurtmalar / Reyslar ekrani.
///
/// Mijoz uni "Buyurtmalar", haydovchi "Reyslarim" deb ko'radi — bir xil
/// ma'lumot, lekin ikki tomon uchun boshqacha ma'no. Sarlavha
/// tashqaridan beriladi.
class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({this.title, super.key});

  /// `null` — standart sarlavha ("Buyurtmalar") joriy tilda.
  final String? title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(title ?? context.l10n.tabOrders),
          bottom: TabBar(
            tabs: [
              Tab(text: context.l10n.ordersTabActive),
              Tab(text: context.l10n.ordersTabHistory),
            ],
          ),
        ),
        body: Column(
          children: [
            // Baho eslatmasi ikkala bandda ham koʻrinadi: baholanmagan
            // reys "Tarix" da yotibdi va foydalanuvchi u yerga kamdan-kam
            // kiradi — eslatma esa tepada turadi
            const _PendingRatingsBanner(),
            Expanded(
              child: TabBarView(
                children: [
                  _OrderList(provider: activeOrdersProvider, isActive: true),
                  _OrderList(provider: orderHistoryProvider, isActive: false),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderList extends ConsumerWidget {
  const _OrderList({required this.provider, required this.isActive});

  final FutureProvider<List<Order>> provider;
  final bool isActive;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(provider);

    return RefreshIndicator(
      onRefresh: () async => ref.refresh(provider.future),
      child: orders.when(
        loading: () => const LoadingState(),
        error: (error, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
            ErrorState(error: error, onRetry: () => ref.invalidate(provider)),
          ],
        ),
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                EmptyState(
                  icon: isActive
                      ? Icons.local_shipping_outlined
                      : Icons.history_rounded,
                  title: isActive ? context.l10n.ordersEmptyActive : context.l10n.ordersEmptyHistory,
                  message: isActive
                      ? context.l10n.ordersEmptyActiveHint
                      : context.l10n.ordersEmptyHistoryHint,
                ),
              ],
            );
          }

          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, index) {
              final order = items[index];
              return OrderCard(
                order: order,
                onTap: () => context.push('/order/${order.id}'),
              );
            },
          );
        },
      ),
    );
  }
}

/// Baho kutayotgan reyslar eslatmasi.
///
/// NEGA BANNER (bildirishnoma emas): baho berish shoshilinch emas,
/// lekin unutiladi. Push xabar bezovta qiladi, banner esa foydalanuvchi
/// o'zi ilovaga kirganda ko'rinadi va bir bosishda hal bo'ladi.
class _PendingRatingsBanner extends ConsumerWidget {
  const _PendingRatingsBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingRatingsProvider).valueOrNull ?? const [];
    if (pending.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final first = pending.first;

    return Material(
      color: first.isUrgent ? AppColors.warningLight : AppColors.primaryLight,
      child: InkWell(
        onTap: () => context.push('/order/${first.orderId}'),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Row(
            children: [
              Icon(
                Icons.star_outline_rounded,
                color: first.isUrgent ? AppColors.warning : AppColors.primary,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      pending.length == 1
                          ? context.l10n.ratingPendingOne(first.publicNo)
                          : context.l10n.ratingPendingMany(pending.length),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      // Muddat aytiladi: "keyinroq" deb qoldirgan
                      // foydalanuvchi qancha vaqti borligini bilishi kerak
                      first.daysLeft <= 0
                          ? context.l10n.ratingLastDay
                          : context.l10n.ratingDaysLeft(first.counterpartyName, first.daysLeft),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.gray400),
            ],
          ),
        ),
      ),
    );
  }
}

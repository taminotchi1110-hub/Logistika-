import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_states.dart';
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
  const OrdersScreen({this.title = 'Buyurtmalar', super.key});

  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(title),
          bottom: const TabBar(
            tabs: [Tab(text: 'Faol'), Tab(text: 'Tarix')],
          ),
        ),
        body: TabBarView(
          children: [
            _OrderList(provider: activeOrdersProvider, isActive: true),
            _OrderList(provider: orderHistoryProvider, isActive: false),
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
                  title: isActive ? 'Faol reys yoʻq' : 'Tarix boʻsh',
                  message: isActive
                      ? 'Taklif qabul qilinganda reys shu yerda paydo boʻladi '
                          'va butun yoʻl davomida shu yerdan boshqariladi.'
                      : 'Yakunlangan va bekor qilingan reyslar shu yerda qoladi.',
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

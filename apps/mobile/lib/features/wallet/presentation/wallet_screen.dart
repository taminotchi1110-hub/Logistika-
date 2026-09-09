import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/wallet.dart';
import 'payout_sheet.dart';
import 'topup_sheet.dart';
import 'wallet_providers.dart';

/// Hamyon.
///
/// HAYDOVCHI UCHUN BU MOLIYAVIY ASBOB, MIJOZ UCHUN — HISOB.
/// Haydovchida balans MANFIY bo'lishi mumkin: naqd buyurtmalarda u
/// pulni qo'lga oladi, platforma ulushi esa qarzga yoziladi. Shuning
/// uchun manfiy balans xato emas va qizil rangda "buzilgan" kabi
/// ko'rsatilmaydi — u tushuntiriladi.
class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(walletProvider);
    final isDriver = ref.watch(currentUserProvider)?.role.canDrive ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Hamyon')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(walletProvider);
          ref.invalidate(walletHistoryProvider);
          ref.invalidate(payoutsProvider);
        },
        child: wallet.when(
          loading: () => const LoadingState(),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
              ErrorState(error: error, onRetry: () => ref.invalidate(walletProvider)),
            ],
          ),
          data: (data) => _body(context, ref, data, isDriver: isDriver),
        ),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    WidgetRef ref,
    Wallet wallet, {
    required bool isDriver,
  }) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        _BalanceCard(wallet: wallet, isDriver: isDriver),
        const SizedBox(height: AppSpacing.lg),

        Row(
          children: [
            Expanded(
              child: AppButton(
                label: 'Toʻldirish',
                icon: Icons.add_rounded,
                onPressed: () => _openTopup(context, ref),
              ),
            ),
            if (isDriver) ...[
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: AppButton.secondary(
                  label: 'Yechish',
                  icon: Icons.account_balance_rounded,
                  onPressed: () => _openPayout(context, ref, wallet),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: AppSpacing.xl),

        if (isDriver) ...[
          const _PayoutSection(),
          const SizedBox(height: AppSpacing.xl),
        ],

        Text('Harakatlar', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: AppSpacing.md),
        const _HistorySection(),
      ],
    );
  }

  Future<void> _openTopup(BuildContext context, WidgetRef ref) async {
    final done = await showTopupSheet(context);
    if (done ?? false) {
      ref.invalidate(walletProvider);
      ref.invalidate(walletHistoryProvider);
    }
  }

  Future<void> _openPayout(BuildContext context, WidgetRef ref, Wallet wallet) async {
    final done = await showPayoutSheet(context, wallet: wallet);
    if (done ?? false) {
      ref.invalidate(walletProvider);
      ref.invalidate(walletHistoryProvider);
      ref.invalidate(payoutsProvider);
    }
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet, required this.isDriver});

  final Wallet wallet;
  final bool isDriver;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final negative = wallet.isNegative;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: AppColors.gray900,
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Balans',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.white.withValues(alpha: 0.7),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            formatSoum(wallet.balanceTiyin),
            style: theme.textTheme.headlineMedium?.copyWith(
              color: AppColors.white,
              fontWeight: FontWeight.w700,
            ),
          ),

          // Manfiy balans haydovchida NORMAL: naqd buyurtmada u pulni
          // qoʻlga oladi, komissiya esa qarzga yoziladi
          if (negative && isDriver) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              'Naqd buyurtmalardagi komissiya qarzi. '
              'Ruxsat etilgan chegara: ${formatSoum(wallet.creditLimitTiyin)}.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.white.withValues(alpha: 0.7),
              ),
            ),
          ],

          // Chegaradan oshgan — bu ENDI toʻsiq, uni aniq aytish kerak
          if (!wallet.canTakeOrders) ...[
            const SizedBox(height: AppSpacing.lg),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.danger,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Row(
                children: [
                  const Icon(Icons.block_rounded, size: 16, color: AppColors.white),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      'Qarz chegaradan oshdi — yangi buyurtma olib boʻlmaydi. '
                      'Toʻlash kerak: ${formatSoum(wallet.debtToPayTiyin)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HistorySection extends ConsumerWidget {
  const _HistorySection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(walletHistoryProvider);

    return history.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.xl),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
      ),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(walletHistoryProvider),
      ),
      data: (entries) {
        if (entries.isEmpty) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
            child: EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'Harakat yoʻq',
              message: 'Hisobni toʻldirsangiz yoki buyurtma yakunlansangiz '
                  'bu yerda koʻrinadi.',
            ),
          );
        }

        return Column(
          children: [
            for (final entry in entries) _HistoryTile(entry: entry),
          ],
        );
      },
    );
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.entry});

  final LedgerEntry entry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final income = entry.isIncome;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: income ? AppColors.successLight : AppColors.gray100,
              shape: BoxShape.circle,
            ),
            child: Icon(
              income ? Icons.south_west_rounded : Icons.north_east_rounded,
              size: 18,
              color: income ? AppColors.success : AppColors.gray500,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.description.isEmpty ? entry.type.label : entry.description,
                  style: theme.textTheme.bodyMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  _date(entry.createdAt),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${income ? '+' : ''}${formatSoum(entry.amountTiyin)}',
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: income ? AppColors.success : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 2),
              // Amaldan keyingi balans — mijoz hisobni oʻzi tekshira oladi
              Text(
                formatSoum(entry.balanceAfterTiyin, withSuffix: false),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _date(DateTime value) {
    final local = value.toLocal();
    const months = [
      'yan', 'fev', 'mar', 'apr', 'may', 'iyun',
      'iyul', 'avg', 'sent', 'okt', 'noy', 'dek',
    ];
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '${local.day} ${months[local.month - 1]}, $hh:$mm';
  }
}

class _PayoutSection extends ConsumerWidget {
  const _PayoutSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payouts = ref.watch(payoutsProvider).valueOrNull ?? const <Payout>[];
    // Faqat bajarilmagan soʻrovlar: bajarilganlari harakatlar tarixida
    final pending = payouts.where((item) => !item.isDone).toList();

    if (pending.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Yechish soʻrovlari', style: theme.textTheme.titleSmall),
        const SizedBox(height: AppSpacing.md),
        for (final payout in pending)
          Container(
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.gray50,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Icon(
                  payout.isFailed ? Icons.error_outline_rounded : Icons.schedule_rounded,
                  size: AppSizes.iconSm,
                  color: payout.isFailed ? AppColors.danger : AppColors.gray400,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${formatSoum(payout.amountTiyin)} → ${payout.cardMask}',
                        style: theme.textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        payout.failureReason ?? payout.statusLabel,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: payout.isFailed
                              ? AppColors.danger
                              : AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

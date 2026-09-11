import 'package:flutter/material.dart';
import 'package:karvon/core/l10n/formatters.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/order.dart';
import '../order_l10n.dart';

/// Reysning 13 bosqichli yo'li.
///
/// NEGA HAMMA BOSQICH KO'RSATILADI (faqat o'tilganlari emas): mijoz
/// "keyin nima bo'ladi" degan savolga javob olishi kerak. Faqat
/// bajarilganini ko'rsatish reysni tugagandek his qildiradi va
/// "haydovchi qayerda qoldi?" degan qo'ng'iroqlarni ko'paytiradi.
///
/// Bajarilgan qadamlar VAQTI bilan, kelgusilar kulrang — farq bir
/// qarashda ko'rinadi.
class StatusTimeline extends StatelessWidget {
  const StatusTimeline({
    required this.current,
    required this.history,
    super.key,
  });

  final OrderStatus current;
  final List<OrderHistoryEntry> history;

  /// Asosiy yo'l — bekor qilish va nizo bu chiziqda yo'q.
  static const _mainPath = [
    OrderStatus.assigned,
    OrderStatus.confirmed,
    OrderStatus.enRouteToPickup,
    OrderStatus.arrivedAtPickup,
    OrderStatus.loaded,
    OrderStatus.inTransit,
    OrderStatus.arrivedAtDelivery,
    OrderStatus.delivered,
    OrderStatus.completed,
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Tarixdagi vaqtlar: bir status ikki marta bo'lsa (nizodan qaytish)
    // BIRINCHISI olinadi — bosqich aynan o'shanda bajarilgan
    final times = <OrderStatus, OrderHistoryEntry>{};
    for (final entry in history) {
      times.putIfAbsent(entry.status, () => entry);
    }

    // Bekor qilingan reysda asosiy yo'lni davom ettirish yolg'on
    // bo'lardi: qolgan bosqichlar hech qachon bo'lmaydi
    final cancelled = history.where((entry) => entry.status.isCancelled).toList();
    final stopAt = cancelled.isEmpty ? _mainPath.length : current.step;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < _mainPath.length; i++)
          if (cancelled.isEmpty || _mainPath[i].step <= stopAt)
            _Step(
              status: _mainPath[i],
              entry: times[_mainPath[i]],
              isDone: _mainPath[i].step <= current.step,
              isCurrent: _mainPath[i] == current,
              isLast: i == _mainPath.length - 1 && cancelled.isEmpty,
            ),

        // Bekor qilish yoki nizo — chiziqning oxirida, alohida rangda
        for (final entry in cancelled)
          _Step(
            status: entry.status,
            entry: entry,
            isDone: true,
            isCurrent: true,
            isLast: true,
          ),

        if (history.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Text(
              context.l10n.timelineLoading,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.status,
    required this.entry,
    required this.isDone,
    required this.isCurrent,
    required this.isLast,
  });

  final OrderStatus status;
  final OrderHistoryEntry? entry;
  final bool isDone;
  final bool isCurrent;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = isDone ? status.color : AppColors.gray300;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // --- nuqta va chiziq ---
          Column(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: isDone ? color : AppColors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: color, width: 2),
                ),
                child: Icon(
                  isDone ? Icons.check_rounded : status.icon,
                  size: 15,
                  color: isDone ? AppColors.white : AppColors.gray300,
                ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    // Chiziq keyingi qadamgacha: bajarilgan qism rangli
                    color: isDone && !isCurrent ? color : AppColors.gray200,
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppSpacing.md),

          // --- matn ---
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          entry?.statusText(context.l10n) ?? status.localized(context.l10n),
                          style: theme.textTheme.bodyLarge?.copyWith(
                            fontWeight: isCurrent ? FontWeight.w600 : FontWeight.w400,
                            color: isDone ? AppColors.textPrimary : AppColors.textDisabled,
                          ),
                        ),
                      ),
                      if (entry != null)
                        Text(
                          _formatTime(entry!.at),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                  if (entry?.note != null && entry!.note!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      entry!.note!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                  if (entry?.hasLocation ?? false) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const Icon(
                          Icons.place_outlined,
                          size: 13,
                          color: AppColors.gray400,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          context.l10n.timelineLocationRecorded,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.gray400,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Bugungi qadam — faqat vaqt, boshqa kun — sana ham.
  static String _formatTime(DateTime value) {
    final local = value.toLocal();
    final now = DateTime.now();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');

    final sameDay = local.year == now.year &&
        local.month == now.month &&
        local.day == now.day;

    if (sameDay) return '$hh:$mm';
    return '${local.day}.${local.month.toString().padLeft(2, '0')} $hh:$mm';
  }
}

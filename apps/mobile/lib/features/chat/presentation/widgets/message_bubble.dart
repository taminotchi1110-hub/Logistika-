import 'package:flutter/material.dart';
import 'package:karvon/core/l10n/formatters.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/conversation.dart';

/// Chat xabari.
///
/// O'Z XABARI O'NGDA, HAMKORNIKI CHAPDA — bu chat interfeyslarining
/// universal qoidasi va foydalanuvchi uni o'rganib kelgan. Tomonni
/// aniqlash `senderId` bo'yicha MIJOZ TOMONIDA bajariladi: server
/// bitta payload'ni ikkala tomonga tarqatadi va unda ko'ruvchiga
/// bog'liq maydon bo'lishi mumkin emas.
class MessageBubble extends StatelessWidget {
  const MessageBubble({
    required this.message,
    required this.isMine,
    this.showDaySeparator = false,
    super.key,
  });

  final ChatMessage message;
  final bool isMine;
  final bool showDaySeparator;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showDaySeparator) _DaySeparator(date: message.createdAt),
        Align(
          alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            constraints: BoxConstraints(
              // Butun ekran kengligidagi xabar o'qishga noqulay
              maxWidth: MediaQuery.sizeOf(context).width * 0.78,
            ),
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: isMine ? AppColors.primary : AppColors.gray100,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(AppRadius.lg),
                topRight: const Radius.circular(AppRadius.lg),
                // "Dumcha" burchagi kim yozganini qo'shimcha bildiradi
                bottomLeft: Radius.circular(isMine ? AppRadius.lg : AppRadius.sm),
                bottomRight: Radius.circular(isMine ? AppRadius.sm : AppRadius.lg),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  message.body,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: isMine ? AppColors.white : AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _time(message.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 11,
                        color: isMine
                            ? AppColors.white.withValues(alpha: 0.75)
                            : AppColors.textSecondary,
                      ),
                    ),
                    if (isMine) ...[
                      const SizedBox(width: AppSpacing.xs),
                      _StatusIcon(message: message),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  static String _time(DateTime value) {
    final local = value.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }
}

/// Yuborilish holati belgisi.
///
/// Foydalanuvchi xabar ketdimi yoki yo'qmi bilishi SHART: belgi
/// bo'lmasa u xabarni qayta yozadi va hamkor ikki marta oladi.
class _StatusIcon extends StatelessWidget {
  const _StatusIcon({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    return switch (message.status) {
      MessageStatus.sending => SizedBox(
          width: 11,
          height: 11,
          child: CircularProgressIndicator(
            strokeWidth: 1.5,
            valueColor: AlwaysStoppedAnimation(
              AppColors.white.withValues(alpha: 0.75),
            ),
          ),
        ),
      MessageStatus.failed => const Icon(
          Icons.error_outline_rounded,
          size: 13,
          color: AppColors.dangerLight,
        ),
      MessageStatus.sent => Icon(
          message.isRead ? Icons.done_all_rounded : Icons.done_rounded,
          size: 13,
          // O'qilgan — yorqinroq: bir qarashda farqlanishi kerak
          color: message.isRead
              ? AppColors.white
              : AppColors.white.withValues(alpha: 0.6),
        ),
    };
  }
}

class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            color: AppColors.gray100,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: Text(
            _label(context, date),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
          ),
        ),
      ),
    );
  }

  /// "Bugun" / "Kecha" sanadan tezroq o'qiladi.
  static String _label(BuildContext context, DateTime value) {
    final local = value.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(local.year, local.month, local.day);
    final diff = today.difference(day).inDays;

    if (diff == 0) return context.l10n.dateToday;
    if (diff == 1) return context.l10n.dateYesterday;

    // Ruschada oy qaratqich kelishigida ("9 сентября"), inglizchada oy
    // kundan oldin — shuning uchun butun qolip tarjimada
    final months = context.l10n.monthsFull.split(',');
    return context.l10n.dayMonth(local.day, months[local.month - 1].trim());
  }
}

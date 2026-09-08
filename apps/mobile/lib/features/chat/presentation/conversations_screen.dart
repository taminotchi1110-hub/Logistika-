import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/conversation.dart';
import 'chat_providers.dart';

/// Suhbatlar ro'yxati.
class ConversationsScreen extends ConsumerWidget {
  const ConversationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conversations = ref.watch(conversationsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Xabarlar')),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(conversationsProvider.future),
        child: conversations.when(
          loading: () => const LoadingState(),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
              ErrorState(
                error: error,
                onRetry: () => ref.invalidate(conversationsProvider),
              ),
            ],
          ),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  const EmptyState(
                    icon: Icons.chat_bubble_outline_rounded,
                    title: 'Suhbat yoʻq',
                    message: 'Taklif qabul qilinganda chat avtomatik ochiladi. '
                        'Butun muloqot shu yerda — telefon raqami haydovchi yuk '
                        'olish nuqtasiga yetib borgach ochiladi.',
                  ),
                ],
              );
            }

            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: items.length,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, indent: 76),
              itemBuilder: (context, index) => _ConversationTile(
                conversation: items[index],
                onTap: () => _open(context, items[index]),
              ),
            );
          },
        ),
      ),
    );
  }

  void _open(BuildContext context, Conversation conversation) {
    context.push('/chat/${conversation.id}', extra: conversation);
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, required this.onTap});

  final Conversation conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final order = conversation.order;

    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      leading: CircleAvatar(
        radius: 22,
        backgroundColor: AppColors.primaryLight,
        child: Text(
          conversation.initials,
          style: theme.textTheme.titleSmall?.copyWith(color: AppColors.primary),
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              conversation.counterpartyName,
              style: theme.textTheme.bodyLarge?.copyWith(
                fontWeight:
                    conversation.hasUnread ? FontWeight.w600 : FontWeight.w400,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (conversation.lastMessageAt != null)
            Text(
              _time(conversation.lastMessageAt!),
              style: theme.textTheme.bodySmall?.copyWith(
                color: conversation.hasUnread
                    ? AppColors.primary
                    : AppColors.textSecondary,
              ),
            ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // NEGA YOʻNALISH: bir foydalanuvchi bilan bir nechta reys
          // boʻlishi mumkin va ismlar bir xil koʻrinadi
          if (order != null) ...[
            const SizedBox(height: 2),
            Text(
              '№${order.publicNo} · ${order.route}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 2),
          Row(
            children: [
              Expanded(
                child: Text(
                  conversation.lastMessageBody ?? 'Xabar yoʻq',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: conversation.hasUnread
                        ? AppColors.textPrimary
                        : AppColors.textSecondary,
                    fontWeight: conversation.hasUnread
                        ? FontWeight.w500
                        : FontWeight.w400,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (conversation.hasUnread) ...[
                const SizedBox(width: AppSpacing.sm),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  constraints: const BoxConstraints(minWidth: 20),
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '${conversation.unreadCount}',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  /// Bugun — vaqt, kecha — "kecha", undan oldin — sana.
  static String _time(DateTime value) {
    final local = value.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(local.year, local.month, local.day);
    final diff = today.difference(day).inDays;

    if (diff == 0) {
      return '${local.hour.toString().padLeft(2, '0')}:'
          '${local.minute.toString().padLeft(2, '0')}';
    }
    if (diff == 1) return 'kecha';
    return '${local.day}.${local.month.toString().padLeft(2, '0')}';
  }
}

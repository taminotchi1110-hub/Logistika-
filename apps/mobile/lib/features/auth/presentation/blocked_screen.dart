import 'package:flutter/material.dart';
import 'package:karvon/l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/app_config.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_button.dart';
import '../domain/user.dart';

/// Bloklangan yoki to'xtatilgan akkaunt.
///
/// SABAB KO'RSATILMAYDI: agar "firibgarlik shubhasi" deb yozilsa,
/// haqiqiy firibgar tizim uni qanday aniqlaganini bilib oladi va
/// keyingi safar chetlab o'tadi. Foydalanuvchi qo'llab-quvvatlash
/// xizmatiga murojaat qiladi va u yerda batafsil javob oladi.
class BlockedScreen extends ConsumerWidget {
  const BlockedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final user = ref.watch(currentUserProvider);
    final suspended = user?.status == UserStatus.suspended;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 88,
                height: 88,
                decoration: const BoxDecoration(
                  color: AppColors.dangerLight,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.block_rounded,
                  size: 44,
                  color: AppColors.danger,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                suspended ? l10n.blockedSuspended : l10n.blockedBanned,
                style: theme.textTheme.headlineMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                l10n.blockedBody,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xxxl),
              // Raqam `--dart-define=SUPPORT_PHONE` orqali beriladi —
              // to'qima raqamga qo'ng'iroq qildirishdan tugmasiz yaxshiroq
              if (AppConfig.hasSupportPhone) ...[
                AppButton(
                  label: l10n.actionSupport,
                  icon: Icons.support_agent_rounded,
                  onPressed: () => launchUrl(Uri(scheme: 'tel', path: AppConfig.supportPhone)),
                ),
                const SizedBox(height: AppSpacing.md),
              ],
              AppButton.secondary(
                label: l10n.actionLogout,
                onPressed: () => ref.read(authStateProvider.notifier).logout(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

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
                suspended ? 'Akkaunt vaqtincha toʻxtatilgan' : 'Akkaunt bloklangan',
                style: theme.textTheme.headlineMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                'Batafsil maʼlumot uchun qoʻllab-quvvatlash xizmatiga '
                'murojaat qiling. Ular sizga sababni tushuntiradi va '
                'tiklash imkoniyatini koʻrib chiqadi.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xxxl),
              AppButton(
                label: 'Qoʻllab-quvvatlash',
                icon: Icons.support_agent_rounded,
                onPressed: () => launchUrl(Uri.parse('tel:+998712000000')),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton.secondary(
                label: 'Chiqish',
                onPressed: () => ref.read(authStateProvider.notifier).logout(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

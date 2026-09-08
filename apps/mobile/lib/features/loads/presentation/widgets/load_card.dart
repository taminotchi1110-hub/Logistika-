import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/money.dart';
import '../../domain/load.dart';

/// Yuk kartochkasi — lentaning asosiy elementi.
///
/// AXBOROT IYERARXIYASI (haydovchi 2 soniyada qaror qabul qiladi):
///
///   1. **Marshrut** — eng katta matn. Haydovchi avval "qayerdan
///      qayerga" ni ko'radi, keyin qolganini.
///   2. **Narx** — ikkinchi o'rinda, o'ng tomonda, yirik va qalin.
///      Bu qaror qabul qilishdagi ikkinchi omil.
///   3. **Og'irlik, masofa, sana** — kichikroq, bir qatorda.
///   4. **Belgilar** (shoshilinch, mos foiz) — rang bilan ajratilgan.
///
/// Kartochka BALAND emas: ekranda kamida 3 tasi ko'rinishi kerak,
/// aks holda haydovchi ko'p aylantiradi va tez charchaydi.
class LoadCard extends StatelessWidget {
  const LoadCard({
    required this.load,
    required this.onTap,
    this.showMatchScore = false,
    super.key,
  });

  final Load load;
  final VoidCallback onTap;

  /// Match Score ko'rsatilsinmi — faqat lentada, "yuklarim" da emas.
  final bool showMatchScore;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // --- belgilar qatori ---
              if (load.isUrgent || (showMatchScore && load.matchScore != null))
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.xs,
                    children: [
                      if (load.isUrgent)
                        const _Badge(
                          label: 'Shoshilinch',
                          icon: Icons.bolt_rounded,
                          color: AppColors.warning,
                          background: AppColors.warningLight,
                        ),
                      if (showMatchScore && load.matchScore != null)
                        _Badge(
                          label: '${load.matchScore!.round()}% mos',
                          icon: Icons.auto_awesome_rounded,
                          color: AppColors.success,
                          background: AppColors.successLight,
                        ),
                      if (load.isEscrow)
                        const _Badge(
                          label: 'Kafolatli toʻlov',
                          icon: Icons.verified_user_rounded,
                          color: AppColors.primary,
                          background: AppColors.primaryLight,
                        ),
                    ],
                  ),
                ),

              // --- marshrut va narx ---
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _Route(load: load)),
                  const SizedBox(width: AppSpacing.md),
                  _Price(load: load),
                ],
              ),

              const SizedBox(height: AppSpacing.md),
              const Divider(height: 1),
              const SizedBox(height: AppSpacing.md),

              // --- tafsilotlar ---
              Row(
                children: [
                  _Detail(
                    icon: Icons.scale_outlined,
                    text: formatWeight(load.weightKg),
                  ),
                  const SizedBox(width: AppSpacing.lg),
                  if (load.distanceKm != null)
                    _Detail(
                      icon: Icons.route_outlined,
                      text: formatDistance(load.distanceKm),
                    ),
                  const Spacer(),
                  // Olish nuqtasigacha masofa — haydovchi uchun eng
                  // muhim raqamlardan biri: "borishga arziydimi?"
                  if (load.distanceToPickupKm != null)
                    _Detail(
                      icon: Icons.near_me_outlined,
                      text: 'Sizga ${formatDistance(load.distanceToPickupKm)}',
                      highlighted: load.distanceToPickupKm! <= 25,
                    ),
                ],
              ),

              const SizedBox(height: AppSpacing.sm),

              Row(
                children: [
                  const Icon(
                    Icons.schedule_rounded,
                    size: AppSizes.iconSm,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    _formatPickupWindow(load.pickupFrom, load.pickupTo),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const Spacer(),
                  if (load.offerCount > 0)
                    Text(
                      '${load.offerCount} taklif',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),

              // --- moslik sabablari ---
              if (showMatchScore && load.matchReasons.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  load.matchReasons.join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.success,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// Yuklash oynasi: "Bugun 14:00–18:00" yoki "9-sent 08:00–12:00".
  ///
  /// "Bugun"/"Ertaga" so'zlari sanadan ko'ra tezroq o'qiladi.
  static String _formatPickupWindow(DateTime from, DateTime to) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(from.year, from.month, from.day);
    final diff = day.difference(today).inDays;

    final prefix = switch (diff) {
      0 => 'Bugun',
      1 => 'Ertaga',
      _ => '${from.day}-${_monthShort(from.month)}',
    };

    final fromTime = '${from.hour.toString().padLeft(2, '0')}:'
        '${from.minute.toString().padLeft(2, '0')}';
    final toTime = '${to.hour.toString().padLeft(2, '0')}:'
        '${to.minute.toString().padLeft(2, '0')}';

    return '$prefix $fromTime–$toTime';
  }

  static String _monthShort(int month) {
    const months = [
      'yan', 'fev', 'mar', 'apr', 'may', 'iyun',
      'iyul', 'avg', 'sent', 'okt', 'noy', 'dek',
    ];
    return months[(month - 1).clamp(0, 11)];
  }
}

class _Route extends StatelessWidget {
  const _Route({required this.load});

  final Load load;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Flexible(
              child: Text(
                load.pickup.shortLabel,
                style: theme.textTheme.titleMedium,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: Icon(
                Icons.arrow_forward_rounded,
                size: AppSizes.iconSm,
                color: AppColors.gray400,
              ),
            ),
            Flexible(
              child: Text(
                load.delivery.shortLabel,
                style: theme.textTheme.titleMedium,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          load.title,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}

class _Price extends StatelessWidget {
  const _Price({required this.load});

  final Load load;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (!load.hasPrice) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            'Kelishuv',
            style: theme.textTheme.titleMedium?.copyWith(
              color: AppColors.accentDark,
            ),
          ),
          Text(
            'asosida',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          formatSoum(load.priceTiyin, withSuffix: false),
          style: theme.textTheme.titleLarge?.copyWith(
            color: AppColors.primary,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        Text(
          'soʻm',
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.icon, required this.text, this.highlighted = false});

  final IconData icon;
  final String text;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final color = highlighted ? AppColors.success : AppColors.textSecondary;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: AppSizes.iconSm, color: color),
        const SizedBox(width: AppSpacing.xs),
        Text(
          text,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: color,
                fontWeight: highlighted ? FontWeight.w600 : FontWeight.w400,
              ),
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({
    required this.label,
    required this.icon,
    required this.color,
    required this.background,
  });

  final String label;
  final IconData icon;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: AppSpacing.xs),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }
}

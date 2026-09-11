import 'package:flutter/material.dart';
import 'package:karvon/core/l10n/formatters.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../vehicles/domain/vehicle.dart';
import '../../domain/driver_readiness.dart';
import '../profile_l10n.dart';

/// Haydovchining tayyorlik kartochkasi.
///
/// NEGA HAR BIR QADAM NEGA KERAKLIGI YOZILADI: quruq talab ro'yxati
/// ("pasport yuklang") qarshilik uyg'otadi va tashlab ketishga olib
/// keladi. Sababi aytilgan talab esa bajariladi — ayniqsa u
/// foydalanuvchining o'z foydasini ko'rsatsa ("yo'nalish ko'rsatilsa,
/// tizim sizga mos yuklarni o'zi topib beradi").
class ReadinessCard extends StatelessWidget {
  const ReadinessCard({
    required this.readiness,
    required this.onSubmit,
    this.isSubmitting = false,
    super.key,
  });

  final DriverReadiness readiness;
  final VoidCallback onSubmit;
  final bool isSubmitting;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Hammasi tayyor — qisqa tasdiq yetarli, uzun matn ortiqcha
    if (readiness.canSendOffers) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.successLight,
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Row(
          children: [
            const Icon(Icons.verified_rounded, color: AppColors.success),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                context.l10n.readinessAllSet,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.success,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final pending = readiness.verificationStatus == VerificationStatus.pending;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  pending ? context.l10n.readinessUnderReview : context.l10n.readinessToStart,
                  style: theme.textTheme.titleSmall,
                ),
              ),
              Text(
                '${readiness.completedCount}/5',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),

          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: LinearProgressIndicator(
              value: readiness.progress,
              minHeight: 6,
              backgroundColor: AppColors.gray100,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          if (pending)
            Text(
              context.l10n.readinessPendingNote,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
              ),
            )
          else if (readiness.verificationStatus == VerificationStatus.rejected)
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.dangerLight,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Text(
                context.l10n.readinessRejectedNote,
                style: theme.textTheme.bodySmall?.copyWith(color: AppColors.danger),
              ),
            )
          else
            for (final step in readiness.missingSteps) _StepRow(step: step),

          if (readiness.canSubmit) ...[
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: isSubmitting ? null : onSubmit,
                child: isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          valueColor: AlwaysStoppedAnimation(AppColors.white),
                        ),
                      )
                    : Text(context.l10n.actionSubmitForReview),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.step});

  final ReadinessStep step;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.radio_button_unchecked_rounded,
            size: AppSizes.iconSm,
            color: AppColors.gray400,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(step.localized(context.l10n), style: theme.textTheme.bodyMedium),
                if (step.why(context.l10n).isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    step.why(context.l10n),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

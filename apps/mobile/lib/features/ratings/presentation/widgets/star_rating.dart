import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';

/// Yulduzli baho — tanlash uchun.
///
/// YULDUZLAR KATTA: haydovchi ilovani yo'lda, qo'lqopda yoki
/// silkinayotgan kabinada ishlatadi. Kichik nishon xato bosishga
/// olib keladi va noto'g'ri baho qo'yiladi — uni tuzatib bo'lmaydi.
class StarRatingInput extends StatelessWidget {
  const StarRatingInput({
    required this.value,
    required this.onChanged,
    this.size = 40,
    super.key,
  });

  final int value;
  final ValueChanged<int> onChanged;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var star = 1; star <= 5; star++)
          IconButton(
            onPressed: () => onChanged(star),
            iconSize: size,
            // Teginish maydoni belgidan kattaroq — bu Material tavsiyasi
            constraints: BoxConstraints(
              minWidth: size + AppSpacing.md,
              minHeight: size + AppSpacing.sm,
            ),
            padding: EdgeInsets.zero,
            tooltip: '$star',
            icon: Icon(
              star <= value ? Icons.star_rounded : Icons.star_outline_rounded,
              color: star <= value ? AppColors.accent : AppColors.gray300,
            ),
          ),
      ],
    );
  }
}

/// Mezon bo'yicha baho — bitta qator.
class CriterionRating extends StatelessWidget {
  const CriterionRating({
    required this.label,
    required this.value,
    required this.onChanged,
    this.hint,
    super.key,
  });

  final String label;
  final int? value;
  final ValueChanged<int> onChanged;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: theme.textTheme.bodyMedium),
                if (hint != null)
                  Text(
                    hint!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var star = 1; star <= 5; star++)
                GestureDetector(
                  onTap: () => onChanged(star),
                  behavior: HitTestBehavior.opaque,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
                    child: Icon(
                      star <= (value ?? 0)
                          ? Icons.star_rounded
                          : Icons.star_outline_rounded,
                      size: 22,
                      color: star <= (value ?? 0)
                          ? AppColors.accent
                          : AppColors.gray300,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Tayyor bahoni ko'rsatish — tanlab bo'lmaydi.
class StarRatingDisplay extends StatelessWidget {
  const StarRatingDisplay({required this.value, this.size = 16, super.key});

  final int value;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var star = 1; star <= 5; star++)
          Icon(
            star <= value ? Icons.star_rounded : Icons.star_outline_rounded,
            size: size,
            color: star <= value ? AppColors.accent : AppColors.gray300,
          ),
      ],
    );
  }
}

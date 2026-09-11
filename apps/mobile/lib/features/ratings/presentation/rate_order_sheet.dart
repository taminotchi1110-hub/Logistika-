import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_button.dart';
import '../domain/rating.dart';
import 'rating_providers.dart';
import 'widgets/star_rating.dart';

/// Baho berish oynasi.
///
/// KO'R-KO'RONA SXEMA FOYDALANUVCHIGA TUSHUNTIRILADI: u bahosi darhol
/// ko'rinmasligini bilishi kerak, aks holda "yubordim, lekin hech nima
/// bo'lmadi" deb o'ylaydi va qayta yuborishga urinadi.
///
/// Natija: `true` — baho yuborildi.
Future<bool?> showRateOrderSheet(
  BuildContext context, {
  required String orderId,
  required String counterpartyName,
  required bool isRatingDriver,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    ),
    builder: (context) => _RateOrderSheet(
      orderId: orderId,
      counterpartyName: counterpartyName,
      isRatingDriver: isRatingDriver,
    ),
  );
}

class _RateOrderSheet extends ConsumerStatefulWidget {
  const _RateOrderSheet({
    required this.orderId,
    required this.counterpartyName,
    required this.isRatingDriver,
  });

  final String orderId;
  final String counterpartyName;

  /// Haydovchini baholayapmizmi (ya'ni foydalanuvchi — mijoz).
  final bool isRatingDriver;

  @override
  ConsumerState<_RateOrderSheet> createState() => _RateOrderSheetState();
}

class _RateOrderSheetState extends ConsumerState<_RateOrderSheet> {
  final _commentController = TextEditingController();

  RatingDraft _draft = const RatingDraft();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_draft.isValid || _isSubmitting) return;
    setState(() => _isSubmitting = true);

    try {
      await ref.read(ratingsRepositoryProvider).submit(
            widget.orderId,
            _draft.copyWith(comment: _commentController.text),
          );

      if (!mounted) return;
      ref.invalidate(pendingRatingsProvider);
      ref.invalidate(orderRatingsProvider(widget.orderId));
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(context, error)),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  /// Yulduzlar soniga mos matn — raqam o'zi hech narsa demaydi.
  String get _scoreLabel => switch (_draft.score) {
        1 => 'Juda yomon',
        2 => 'Yomon',
        3 => 'Oʻrtacha',
        4 => 'Yaxshi',
        5 => 'Aʼlo',
        _ => 'Yulduzni tanlang',
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.gray200,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            Center(
              child: Text(
                widget.isRatingDriver
                    ? 'Haydovchini baholang'
                    : 'Yuk beruvchini baholang',
                style: theme.textTheme.titleMedium,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Center(
              child: Text(
                widget.counterpartyName,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            StarRatingInput(
              value: _draft.score,
              onChanged: (score) => setState(() => _draft = _draft.copyWith(score: score)),
            ),
            const SizedBox(height: AppSpacing.xs),
            Center(
              child: Text(
                _scoreLabel,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: _draft.isValid ? AppColors.textPrimary : AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // Mezonlar IXTIYORIY: majburiy qilinsa foydalanuvchi
            // hammasiga "5" qoʻyib qutuladi va baho maʼnosini yoʻqotadi
            Text('Batafsil (ixtiyoriy)', style: theme.textTheme.labelLarge),
            const SizedBox(height: AppSpacing.md),

            CriterionRating(
              label: 'Vaqtida',
              hint: widget.isRatingDriver
                  ? 'Kelishilgan vaqtda yetib keldimi'
                  : 'Yuk tayyor holda kutdimi',
              value: _draft.punctuality,
              onChanged: (value) =>
                  setState(() => _draft = _draft.copyWith(punctuality: value)),
            ),
            CriterionRating(
              label: 'Muomala',
              value: _draft.communication,
              onChanged: (value) =>
                  setState(() => _draft = _draft.copyWith(communication: value)),
            ),
            // YUK HOLATI faqat mijozdan haydovchiga: haydovchi mijozning
            // yukini baholay olmaydi — u yukni koʻrgan, lekin tayyorlamagan
            if (widget.isRatingDriver)
              CriterionRating(
                label: 'Yuk holati',
                hint: 'Yuk butun va shikastsiz yetib keldimi',
                value: _draft.cargoCondition,
                onChanged: (value) =>
                    setState(() => _draft = _draft.copyWith(cargoCondition: value)),
              ),
            CriterionRating(
              label: 'Ishonchlilik',
              value: _draft.reliability,
              onChanged: (value) =>
                  setState(() => _draft = _draft.copyWith(reliability: value)),
            ),

            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: _commentController,
              maxLines: 4,
              minLines: 2,
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'Izoh (ixtiyoriy)',
                counterText: '',
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            // Foydalanuvchi bahosi darhol koʻrinmasligini BILISHI kerak,
            // aks holda "yubordim, lekin hech nima boʻlmadi" deb qayta
            // yuborishga urinadi
            Row(
              children: [
                const Icon(
                  Icons.visibility_off_outlined,
                  size: AppSizes.iconSm,
                  color: AppColors.gray400,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    'Bahongiz hamkor ham baho bermaguncha yashirin turadi. '
                    'Shu tufayli ikkalangiz ham halol baho bera olasiz.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),

            AppButton(
              label: 'Baho berish',
              isLoading: _isSubmitting,
              onPressed: _draft.isValid ? _submit : null,
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ),
      ),
    );
  }
}

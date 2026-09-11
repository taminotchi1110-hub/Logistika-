import 'package:flutter/material.dart';
import 'package:karvon/l10n/app_localizations.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import 'app_button.dart';

/// Bo'sh ro'yxat holati.
///
/// "Ma'lumot yo'q" degan quruq matn foydalanuvchini boshi berk ko'chaga
/// olib kiradi. Har bir bo'sh holatda KEYINGI QADAM ko'rsatiladi:
/// "Yuklar yo'q" emas, "Hozircha yuk yo'q — filtrni kengaytiring".
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.title,
    this.message,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final String title;
  final String? message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(
                color: AppColors.gray100,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: AppSizes.iconLg, color: AppColors.gray400),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              title,
              style: theme.textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            if (message != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                message!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: actionLabel!,
                onPressed: onAction,
                expanded: false,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Xato holati.
///
/// TARMOQ XATOSI ALOHIDA: "qayta urinish" tugmasi bilan. Boshqa
/// xatolarda qayta urinish odatda yordam bermaydi va tugma faqat
/// umid beradi.
class ErrorState extends StatelessWidget {
  const ErrorState({required this.error, this.onRetry, super.key});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final api = error is ApiException ? error as ApiException : null;
    final isNetwork = api?.isNetwork ?? false;
    final message = api != null ? localizeError(context, api) : l10n.errUnexpected;

    return EmptyState(
      icon: isNetwork ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
      title: isNetwork ? l10n.stateNetworkTitle : l10n.stateErrorTitle,
      message: message,
      actionLabel: onRetry != null && isNetwork ? l10n.actionRetry : null,
      onAction: onRetry,
    );
  }
}

/// Yuklanish holati.
class LoadingState extends StatelessWidget {
  const LoadingState({this.message, super.key});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(strokeWidth: 2.5),
          if (message != null) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(
              message!,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppColors.textSecondary,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Ro'yxat elementi o'rnidagi "skelet".
///
/// NEGA SPINNER EMAS: skelet interfeys tuzilishini oldindan ko'rsatadi
/// va kutish qisqaroq tuyuladi. Bu o'lchangan effekt, shunchaki
/// zamonaviylik emas.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    this.height = 16,
    this.width,
    this.radius = AppRadius.sm,
    super.key,
  });

  final double height;
  final double? width;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
            color: Color.lerp(
              AppColors.gray100,
              AppColors.gray200,
              _controller.value,
            ),
            borderRadius: BorderRadius.circular(widget.radius),
          ),
        );
      },
    );
  }
}

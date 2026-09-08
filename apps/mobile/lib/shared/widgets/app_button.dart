import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';

enum AppButtonVariant { primary, secondary, danger, ghost }

/// Yagona tugma.
///
/// YUKLANISH HOLATI TUGMA ICHIDA: alohida `isLoading` bayrog'i bilan
/// ekranni to'sadigan indikator o'rniga. Sabab — foydalanuvchi qaysi
/// amal bajarilayotganini ko'radi va ekranning qolgan qismi bilan
/// ishlashda davom eta oladi.
///
/// Yuklanayotganda tugma O'CHIRILADI: ikki marta bosish natijasida
/// ikkita buyurtma yaratilishi mumkin bo'lmasligi kerak.
class AppButton extends StatelessWidget {
  const AppButton({
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.expanded = true,
    super.key,
  });

  const AppButton.secondary({
    required this.label,
    required this.onPressed,
    this.icon,
    this.isLoading = false,
    this.expanded = true,
    super.key,
  }) : variant = AppButtonVariant.secondary;

  const AppButton.danger({
    required this.label,
    required this.onPressed,
    this.icon,
    this.isLoading = false,
    this.expanded = true,
    super.key,
  }) : variant = AppButtonVariant.danger;

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool isLoading;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !isLoading;

    final child = isLoading
        ? SizedBox(
            height: 22,
            width: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              valueColor: AlwaysStoppedAnimation(_foreground),
            ),
          )
        : Row(
            mainAxisSize: expanded ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: AppSizes.iconMd),
                const SizedBox(width: AppSpacing.sm),
              ],
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          );

    final button = switch (variant) {
      AppButtonVariant.primary => ElevatedButton(
          onPressed: enabled ? onPressed : null,
          child: child,
        ),
      AppButtonVariant.secondary => OutlinedButton(
          onPressed: enabled ? onPressed : null,
          child: child,
        ),
      AppButtonVariant.danger => ElevatedButton(
          onPressed: enabled ? onPressed : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.danger,
            foregroundColor: AppColors.white,
          ),
          child: child,
        ),
      AppButtonVariant.ghost => TextButton(
          onPressed: enabled ? onPressed : null,
          child: child,
        ),
    };

    return expanded ? SizedBox(width: double.infinity, child: button) : button;
  }

  Color get _foreground => switch (variant) {
        AppButtonVariant.primary || AppButtonVariant.danger => AppColors.white,
        _ => AppColors.primary,
      };
}

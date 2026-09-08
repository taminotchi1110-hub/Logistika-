import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/phone.dart';

/// Forma bo'limi — sarlavha va ichidagi maydonlar.
///
/// Uzun formada bo'limlarsiz foydalanuvchi "qayerdaman" degan savolga
/// javob topolmaydi. Har bo'lim alohida kartochka: ko'z bilan ajratish
/// o'qishni sezilarli tezlashtiradi.
class SectionCard extends StatelessWidget {
  const SectionCard({
    required this.title,
    required this.children,
    this.subtitle,
    super.key,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // `Material` — oddiy `Container` emas: ichidagi `ListTile` va
    // `SwitchListTile` fon rangini va bosish to'lqinini eng yaqin
    // `Material` ga chizadi. Rangli `Container` ularni to'sib qo'yadi
    // va tugmalar "o'lik" ko'rinadi.
    return Material(
      color: AppColors.white,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: theme.textTheme.titleSmall),
            if (subtitle != null) ...[
              const SizedBox(height: 2),
              Text(
                subtitle!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// Yorliqli matn maydoni.
///
/// `label` maydon USTIDA turadi, ichida emas. Sabab: ichidagi yorliq
/// yozila boshlaganda yo'qoladi va foydalanuvchi nima yozayotganini
/// unutadi — bu uzun formalarda tez-tez uchraydigan xato.
class AppTextField extends StatelessWidget {
  const AppTextField({
    required this.label,
    this.controller,
    this.hint,
    this.helper,
    this.errorText,
    this.keyboardType,
    this.inputFormatters,
    this.maxLines = 1,
    this.maxLength,
    this.suffix,
    this.textCapitalization = TextCapitalization.sentences,
    this.onChanged,
    this.isRequired = false,
    super.key,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? helper;
  final String? errorText;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final int maxLines;
  final int? maxLength;
  final String? suffix;
  final TextCapitalization textCapitalization;
  final ValueChanged<String>? onChanged;
  final bool isRequired;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _FieldLabel(label: label, isRequired: isRequired),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: controller,
            keyboardType: keyboardType,
            inputFormatters: inputFormatters,
            maxLines: maxLines,
            maxLength: maxLength,
            textCapitalization: textCapitalization,
            onChanged: onChanged,
            decoration: InputDecoration(
              hintText: hint,
              errorText: errorText,
              helperText: helper,
              suffixText: suffix,
              // Belgilar hisoblagichi faqat chegaraga yaqinlashganda
              // foydali; doim ko'rinib turishi diqqatni chalg'itadi
              counterText: '',
            ),
          ),
        ],
      ),
    );
  }
}

/// Bosilganda tanlov oynasini ochadigan maydon.
///
/// Ichida qiymat yoki "tanlang" matni turadi. Matn kiritish mumkin
/// emas — qiymat faqat ro'yxatdan keladi.
class AppSelectField extends StatelessWidget {
  const AppSelectField({
    required this.label,
    required this.value,
    required this.onTap,
    this.placeholder = 'Tanlang',
    this.icon,
    this.helper,
    this.isRequired = false,
    this.hasError = false,
    super.key,
  });

  final String label;
  final String? value;
  final VoidCallback onTap;
  final String placeholder;
  final IconData? icon;
  final String? helper;
  final bool isRequired;
  final bool hasError;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isEmpty = value == null || value!.isEmpty;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _FieldLabel(label: label, isRequired: isRequired),
          const SizedBox(height: AppSpacing.sm),
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: Container(
              constraints: const BoxConstraints(minHeight: AppSizes.inputHeight),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.md,
              ),
              decoration: BoxDecoration(
                color: AppColors.gray50,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(
                  color: hasError ? AppColors.danger : AppColors.border,
                ),
              ),
              child: Row(
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: AppSizes.iconSm, color: AppColors.gray400),
                    const SizedBox(width: AppSpacing.md),
                  ],
                  Expanded(
                    child: Text(
                      isEmpty ? placeholder : value!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: isEmpty ? AppColors.gray400 : AppColors.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  const Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: AppColors.gray400,
                  ),
                ],
              ),
            ),
          ),
          if (helper != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              helper!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Ko'p tanlovli belgilar (chip) maydoni.
class ChipsField<T> extends StatelessWidget {
  const ChipsField({
    required this.label,
    required this.options,
    required this.selected,
    required this.onChanged,
    required this.labelOf,
    required this.idOf,
    this.helper,
    this.multiple = true,
    super.key,
  });

  final String label;
  final List<T> options;
  final List<int> selected;
  final ValueChanged<List<int>> onChanged;
  final String Function(T) labelOf;
  final int Function(T) idOf;
  final String? helper;

  /// `false` — bittasini tanlash (radio kabi).
  final bool multiple;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _FieldLabel(label: label, isRequired: false),
          if (helper != null) ...[
            const SizedBox(height: 2),
            Text(
              helper!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final option in options)
                FilterChip(
                  label: Text(labelOf(option)),
                  selected: selected.contains(idOf(option)),
                  onSelected: (isOn) {
                    final id = idOf(option);
                    if (!multiple) {
                      onChanged(isOn ? [id] : const []);
                      return;
                    }
                    final next = [...selected];
                    if (isOn) {
                      next.add(id);
                    } else {
                      next.remove(id);
                    }
                    onChanged(next);
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, required this.isRequired});

  final String label;
  final bool isRequired;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return RichText(
      text: TextSpan(
        text: label,
        style: theme.textTheme.labelLarge?.copyWith(
          color: AppColors.textSecondary,
        ),
        children: [
          if (isRequired)
            const TextSpan(
              text: ' *',
              style: TextStyle(color: AppColors.danger),
            ),
        ],
      ),
    );
  }
}

/// Faqat butun son kiritishga ruxsat beruvchi formatlagich.
class IntegerInputFormatter extends TextInputFormatter {
  const IntegerInputFormatter({this.max});

  final int? max;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'[^\d]'), '');
    if (digits.isEmpty) {
      return newValue.copyWith(text: '', selection: const TextSelection.collapsed(offset: 0));
    }

    final parsed = int.tryParse(digits);
    // 20 xonali son `int` ga sig'maydi — eski qiymatni saqlaymiz
    if (parsed == null) return oldValue;
    if (max != null && parsed > max!) return oldValue;

    return TextEditingValue(
      text: digits,
      selection: TextSelection.collapsed(offset: digits.length),
    );
  }
}

/// Telefon raqami maskasi: `901234567` → `90 123 45 67`.
///
/// Mamlakat kodi maydonda emas, uning yonida turadi — foydalanuvchi
/// `+998` ni har safar yozmasligi kerak.
class UzPhoneInputFormatter extends TextInputFormatter {
  const UzPhoneInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final formatted = formatLocalInput(newValue.text);

    return TextEditingValue(
      text: formatted,
      // Kursor har doim oxirida: bu maskada o'rtaga yozish ma'nosiz
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

/// So'm summasini yozayotganda uch xonalab ajratadi: `240000` → `240 000`.
class SoumInputFormatter extends TextInputFormatter {
  const SoumInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'[^\d]'), '');
    if (digits.isEmpty) {
      return newValue.copyWith(text: '', selection: const TextSelection.collapsed(offset: 0));
    }
    // 15 xonadan ortiq summa haqiqiy emas — kiritishga yo'l qo'ymaymiz
    if (digits.length > 15) return oldValue;

    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
      buffer.write(digits[i]);
    }

    final text = buffer.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

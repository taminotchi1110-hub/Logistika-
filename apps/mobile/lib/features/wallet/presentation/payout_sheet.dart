import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/form_fields.dart';
import '../domain/wallet.dart';
import 'wallet_providers.dart';

/// Pul yechish oynasi.
///
/// KARTA RAQAMI HECH QAYERDA SAQLANMAYDI: server undan faqat
/// maskalangan ko'rinish va PSP tokenini oladi, ilova esa uni
/// oyna yopilishi bilan yo'qotadi. Avtomatik to'ldirish ham yo'q.
Future<bool?> showPayoutSheet(BuildContext context, {required Wallet wallet}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    ),
    builder: (context) => _PayoutSheet(wallet: wallet),
  );
}

class _PayoutSheet extends ConsumerStatefulWidget {
  const _PayoutSheet({required this.wallet});

  final Wallet wallet;

  @override
  ConsumerState<_PayoutSheet> createState() => _PayoutSheetState();
}

class _PayoutSheetState extends ConsumerState<_PayoutSheet> {
  final _amountController = TextEditingController();
  final _cardController = TextEditingController();

  /// Server chegarasi (`PayoutRequestDto`): eng kam 10 000 so'm.
  static const _minSoum = 10000;

  bool _isSubmitting = false;

  @override
  void dispose() {
    _amountController.dispose();
    _cardController.dispose();
    super.dispose();
  }

  int get _amount =>
      int.tryParse(_amountController.text.replaceAll(RegExp(r'[^\d]'), '')) ?? 0;

  String get _cardDigits => _cardController.text.replaceAll(RegExp(r'[^\d]'), '');

  /// Balansdagi mavjud summa (so'mda).
  int get _availableSoum {
    final tiyin = parseTiyin(widget.wallet.balanceTiyin);
    if (tiyin.isNegative) return 0;
    return (tiyin ~/ BigInt.from(tiyinPerSoum)).toInt();
  }

  bool get _isValid =>
      _amount >= _minSoum &&
      _amount <= _availableSoum &&
      // O'zbekiston kartalari 16 xonali; xalqaro kartalar 19 gacha
      _cardDigits.length >= 16 &&
      _cardDigits.length <= 19;

  Future<void> _submit() async {
    if (!_isValid || _isSubmitting) return;
    setState(() => _isSubmitting = true);

    try {
      await ref.read(walletRepositoryProvider).requestPayout(
            amountSoum: _amount,
            cardNumber: _cardDigits,
          );

      if (!mounted) return;
      // Raqamni darhol tozalaymiz — u xotirada ham qolmasin
      _cardController.clear();
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(error)),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final available = _availableSoum;

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
            Text('Kartaga yechish', style: theme.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Mavjud: ${formatSoum(widget.wallet.balanceTiyin)}',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            if (available < _minSoum)
              // Yetarli mablagʻ yoʻq — formani koʻrsatishning maʼnosi yoʻq
              Container(
                padding: const EdgeInsets.all(AppSpacing.lg),
                decoration: BoxDecoration(
                  color: AppColors.warningLight,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Text(
                  'Yechish uchun kamida ${formatSoum(_minSoum * 100)} boʻlishi kerak.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.warning,
                  ),
                ),
              )
            else ...[
              AppTextField(
                label: 'Summa',
                controller: _amountController,
                hint: '200 000',
                suffix: 'soʻm',
                isRequired: true,
                keyboardType: TextInputType.number,
                inputFormatters: const [SoumInputFormatter()],
                onChanged: (_) => setState(() {}),
                helper: 'Eng kam ${formatSoum(_minSoum * 100)}',
                errorText: _amount > available ? 'Balansda yetarli mablagʻ yoʻq' : null,
              ),
              AppTextField(
                label: 'Karta raqami',
                controller: _cardController,
                hint: '8600 1234 5678 1234',
                isRequired: true,
                keyboardType: TextInputType.number,
                textCapitalization: TextCapitalization.none,
                inputFormatters: const [_CardNumberFormatter()],
                onChanged: (_) => setState(() {}),
              ),
              Row(
                children: [
                  const Icon(
                    Icons.shield_outlined,
                    size: AppSizes.iconSm,
                    color: AppColors.gray400,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      'Karta raqami saqlanmaydi — faqat oxirgi 4 raqami '
                      'koʻrinadi. Pul odatda 1 ish kuni ichida oʻtadi.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: 'Yechish',
                isLoading: _isSubmitting,
                onPressed: _isValid ? _submit : null,
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
          ],
        ),
      ),
    );
  }
}

/// Karta raqamini to'rttalab ajratadi: `8600 1234 5678 1234`.
///
/// O'qish osonroq va foydalanuvchi xatoni tezroq ko'radi — noto'g'ri
/// raqamga o'tkazilgan pulni qaytarish murakkab.
class _CardNumberFormatter extends TextInputFormatter {
  const _CardNumberFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'[^\d]'), '');
    if (digits.isEmpty) {
      return newValue.copyWith(
        text: '',
        selection: const TextSelection.collapsed(offset: 0),
      );
    }
    // 19 xonadan uzun karta raqami yo'q
    if (digits.length > 19) return oldValue;

    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && i % 4 == 0) buffer.write(' ');
      buffer.write(digits[i]);
    }

    final text = buffer.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

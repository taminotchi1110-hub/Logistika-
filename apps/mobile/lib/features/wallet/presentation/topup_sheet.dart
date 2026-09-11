import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/form_fields.dart';
import 'wallet_providers.dart';

/// Hisobni to'ldirish oynasi.
///
/// Natija: `true` — to'lov yaratildi va PSP sahifasi ochildi.
Future<bool?> showTopupSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    ),
    builder: (context) => const _TopupSheet(),
  );
}

class _TopupSheet extends ConsumerStatefulWidget {
  const _TopupSheet();

  @override
  ConsumerState<_TopupSheet> createState() => _TopupSheetState();
}

class _TopupSheetState extends ConsumerState<_TopupSheet> {
  final _controller = TextEditingController();

  /// Tez tanlash summalari — foydalanuvchilarning aksariyati shu
  /// qiymatlarni kiritadi va klaviatura ochish shart bo'lmaydi.
  static const _presets = [50000, 100000, 200000, 500000];

  /// Server chegaralari (`TopupDto`): 5 000 – 50 000 000 so'm.
  static const _minSoum = 5000;
  static const _maxSoum = 50000000;

  String _provider = 'CLICK';
  bool _isSubmitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  int get _amount => int.tryParse(_controller.text.replaceAll(RegExp(r'[^\d]'), '')) ?? 0;

  bool get _isValid => _amount >= _minSoum && _amount <= _maxSoum;

  Future<void> _submit() async {
    if (!_isValid || _isSubmitting) return;
    setState(() => _isSubmitting = true);

    try {
      final payment = await ref.read(walletRepositoryProvider).topup(
            amountSoum: _amount,
            provider: _provider,
          );

      if (!mounted) return;

      final url = payment.checkoutUrl;
      if (url == null) {
        setState(() => _isSubmitting = false);
        _showMessage('Toʻlov havolasi olinmadi');
        return;
      }

      // PSP sahifasi TASHQI brauzerda ochiladi: to'lov tizimlari
      // ilova ichidagi WebView'da 3-D Secure'ni bloklashi mumkin
      final opened = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );

      if (!mounted) return;
      if (!opened) {
        setState(() => _isSubmitting = false);
        _showMessage('Toʻlov sahifasini ochib boʻlmadi');
        return;
      }

      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      _showMessage(localizeError(context, error));
    }
  }

  void _showMessage(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), backgroundColor: AppColors.danger),
    );
  }

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
            Text('Hisobni toʻldirish', style: theme.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.lg),

            AppTextField(
              label: 'Summa',
              controller: _controller,
              hint: '100 000',
              suffix: 'soʻm',
              isRequired: true,
              keyboardType: TextInputType.number,
              inputFormatters: const [SoumInputFormatter()],
              onChanged: (_) => setState(() {}),
              helper: 'Eng kam ${formatSoum(_minSoum * 100)}',
            ),

            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final preset in _presets)
                  ActionChip(
                    label: Text(formatSoumShort(preset * 100)),
                    onPressed: () {
                      _controller.text = groupSoumInput('$preset');
                      setState(() {});
                    },
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),

            Text('Toʻlov tizimi', style: theme.textTheme.labelLarge),
            const SizedBox(height: AppSpacing.sm),
            // O'zbekistonda ikkita asosiy tizim; ikkalasi ham
            // backend'da to'liq qo'llab-quvvatlanadi
            RadioGroup<String>(
              groupValue: _provider,
              onChanged: (value) => setState(() => _provider = value ?? 'CLICK'),
              child: const Column(
                children: [
                  RadioListTile<String>(
                    contentPadding: EdgeInsets.zero,
                    value: 'CLICK',
                    title: Text('Click'),
                  ),
                  RadioListTile<String>(
                    contentPadding: EdgeInsets.zero,
                    value: 'PAYME',
                    title: Text('Payme'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            Row(
              children: [
                const Icon(
                  Icons.lock_rounded,
                  size: AppSizes.iconSm,
                  color: AppColors.gray400,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    // Karta maʼlumotlari ILOVAGA KIRITILMAYDI — bu
                    // PCI DSS talabi va foydalanuvchi uchun ham xavfsizroq
                    'Karta maʼlumotlari toʻlov tizimining sahifasida '
                    'kiritiladi — ilova ularni koʻrmaydi.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),

            AppButton(
              label: 'Toʻlash',
              isLoading: _isSubmitting,
              onPressed: _isValid ? _submit : null,
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ),
      ),
    );
  }
}

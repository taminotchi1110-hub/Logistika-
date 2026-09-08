import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/phone.dart';
import '../../../shared/widgets/app_button.dart';

/// Telefon raqami kiritish — ilovaning birinchi ekrani.
///
/// DIZAYN QARORLARI:
///
///   1. **Parol yo'q.** Faqat telefon + SMS kod. Haydovchilar parolni
///      unutadi va tiklash oqimi qo'shimcha to'siq bo'lardi.
///   2. **+998 prefiksi qulflangan.** Foydalanuvchi faqat 9 raqam
///      kiritadi. Mamlakat tanlash ro'yxati yo'q — platforma faqat
///      O'zbekistonda ishlaydi.
///   3. **Operator nomi ko'rsatiladi.** "Beeline raqami" yozuvi
///      foydalanuvchiga raqamni to'g'ri kiritganini tasdiqlaydi.
///   4. **Xato darhol, lekin yumshoq.** Noto'g'ri prefiks kiritilganda
///      matn qizarmaydi — faqat tugma o'chirilgan qoladi. Qizil rang
///      9 raqam to'liq kiritilgandan keyin paydo bo'ladi.
class PhoneScreen extends ConsumerStatefulWidget {
  const PhoneScreen({super.key});

  @override
  ConsumerState<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends ConsumerState<PhoneScreen> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Ekran ochilishi bilan klaviatura — bitta ortiqcha teginish kamayadi
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  String get _digits => _controller.text.replaceAll(RegExp(r'[^\d]'), '');
  bool get _isComplete => _digits.length == 9;
  bool get _isValid => isValidUzbekMobile(_digits);

  Future<void> _submit() async {
    if (!_isValid) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    final phone = normalizePhone(_digits)!;

    try {
      final challenge = await ref.read(authStateProvider.notifier).requestOtp(phone);
      if (!mounted) return;

      context.push('/auth/otp', extra: challenge);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = localizeError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final operator = _isComplete ? operatorName(_digits) : null;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: AppSpacing.xxxl),

              // Logotip o'rnida — hozircha matn
              Text(
                'KARVON',
                style: theme.textTheme.displayMedium?.copyWith(
                  color: AppColors.primary,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Yuk va haydovchini bogʻlaymiz',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),

              const SizedBox(height: AppSpacing.xxxl * 1.5),

              Text('Telefon raqamingiz', style: theme.textTheme.titleMedium),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'SMS orqali tasdiqlash kodi yuboramiz',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),

              TextField(
                controller: _controller,
                focusNode: _focus,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumberNational],
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(9),
                  _PhoneInputFormatter(),
                ],
                decoration: InputDecoration(
                  hintText: '90 123 45 67',
                  errorText: _error,
                  prefixIcon: Padding(
                    padding: const EdgeInsets.only(
                      left: AppSpacing.lg,
                      right: AppSpacing.sm,
                    ),
                    child: Text(
                      '+998',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                  prefixIconConstraints: const BoxConstraints(minWidth: 0),
                  suffixIcon: _isValid
                      ? const Icon(Icons.check_circle_rounded, color: AppColors.success)
                      : null,
                ),
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _submit(),
              ),

              // Operator nomi — raqam to'g'ri kiritilganining tasdiqi
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 150),
                child: operator != null
                    ? Padding(
                        key: ValueKey(operator),
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.sim_card_outlined,
                              size: AppSizes.iconSm,
                              color: AppColors.textSecondary,
                            ),
                            const SizedBox(width: AppSpacing.xs),
                            Text(
                              '$operator raqami',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      )
                    : _isComplete
                        ? Padding(
                            key: const ValueKey('invalid'),
                            padding: const EdgeInsets.only(top: AppSpacing.sm),
                            child: Text(
                              'Bu raqam mobil operatorga tegishli emas',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: AppColors.danger,
                              ),
                            ),
                          )
                        : const SizedBox.shrink(),
              ),

              const Spacer(),

              AppButton(
                label: 'Davom etish',
                isLoading: _loading,
                onPressed: _isValid ? _submit : null,
              ),
              const SizedBox(height: AppSpacing.lg),

              // Shartlar — App Store va Google Play talabi
              Text.rich(
                TextSpan(
                  text: 'Davom etish orqali siz ',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                  children: const [
                    TextSpan(
                      text: 'foydalanish shartlari',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    TextSpan(text: ' va '),
                    TextSpan(
                      text: 'maxfiylik siyosati',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    TextSpan(text: 'ga rozilik bildirasiz'),
                  ],
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
          ),
        ),
      ),
    );
  }
}

/// Kiritish paytida raqamni ajratadi: `90 123 45 67`.
class _PhoneInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final formatted = formatLocalInput(newValue.text);

    return TextEditingValue(
      text: formatted,
      // Kursor har doim oxirida: o'rtaga yozish bu maskada ma'nosiz
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

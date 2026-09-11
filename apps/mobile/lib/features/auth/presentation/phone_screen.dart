import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:karvon/l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/l10n/locale_controller.dart';
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
      setState(() => _error = localizeError(context, error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final operator = _isComplete ? operatorName(_digits) : null;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // TIL TANLAGICH ENG TEPADA VA KIRISHDAN OLDIN.
              //
              // Rus tilida o'qiydigan odam o'zbekcha interfeysni
              // ko'rib, tilni qayerdan almashtirishni bilmasa, ilovani
              // yopadi. Sozlamalarga kirish uchun esa avval ro'yxatdan
              // o'tish kerak — ya'ni "keyin almashtirasiz" ishlamaydi.
              const Align(
                alignment: Alignment.centerRight,
                child: _LanguageButton(),
              ),

              const SizedBox(height: AppSpacing.xl),

              // Logotip o'rnida — hozircha matn.
              // Ilova nomi TARJIMA QILINMAYDI: u brend
              Text(
                'KARVON',
                style: theme.textTheme.displayMedium?.copyWith(
                  color: AppColors.primary,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.appTagline,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),

              const SizedBox(height: AppSpacing.xxxl),

              Text(l10n.phoneTitle, style: theme.textTheme.titleMedium),
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.phoneSubtitle,
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
                  hintText: l10n.phoneHint,
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
                              l10n.phoneOperator(operator),
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
                              l10n.phoneNotMobile,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: AppColors.danger,
                              ),
                            ),
                          )
                        : const SizedBox.shrink(),
              ),

              const Spacer(),

              AppButton(
                label: l10n.actionContinue,
                isLoading: _loading,
                onPressed: _isValid ? _submit : null,
              ),
              const SizedBox(height: AppSpacing.lg),

              // Shartlar — App Store va Google Play talabi
              Text.rich(
                _termsSpan(
                  sentence: l10n.termsAgreement(l10n.termsOfUse, l10n.privacyPolicy),
                  links: [l10n.termsOfUse, l10n.privacyPolicy],
                  base: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
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

/// Shartlar jumlasini havolali bo'laklarga ajratadi.
///
/// NEGA JUMLA BUTUNLIGICHA TARJIMA QILINADI, bo'laklarga bo'linmasdan:
/// so'z tartibi tillarda har xil. O'zbekchada "...ga rozilik
/// bildirasiz" oxirida, inglizchada esa "By continuing you agree to
/// the..." boshida turadi. Bo'laklarni qo'shib yozish (`'siz ' + link
/// + ' va '`) faqat bitta tilda to'g'ri chiqadi.
///
/// Shuning uchun tarjimon TO'LIQ jumlani ko'radi, kod esa havola
/// matnlarini o'sha jumla ichidan topib, ularga uslub beradi.
@visibleForTesting
TextSpan termsSpan({
  required String sentence,
  required List<String> links,
  TextStyle? base,
  TextStyle? linkStyle,
}) =>
    _termsSpan(sentence: sentence, links: links, base: base, linkStyle: linkStyle);

TextSpan _termsSpan({
  required String sentence,
  required List<String> links,
  TextStyle? base,
  TextStyle? linkStyle,
}) {
  final style = linkStyle ??
      const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600);

  final children = <TextSpan>[];
  var rest = sentence;

  while (rest.isNotEmpty) {
    // Eng yaqin havolani topamiz: tarjimada ular istalgan tartibda
    // kelishi mumkin
    var nearest = -1;
    var nearestLink = '';
    for (final link in links) {
      if (link.isEmpty) continue;
      final index = rest.indexOf(link);
      if (index != -1 && (nearest == -1 || index < nearest)) {
        nearest = index;
        nearestLink = link;
      }
    }

    if (nearest == -1) {
      children.add(TextSpan(text: rest));
      break;
    }

    if (nearest > 0) children.add(TextSpan(text: rest.substring(0, nearest)));
    children.add(TextSpan(text: nearestLink, style: style));
    rest = rest.substring(nearest + nearestLink.length);
  }

  return TextSpan(style: base, children: children);
}

/// Til tanlash tugmasi.
class _LanguageButton extends ConsumerWidget {
  const _LanguageButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(localeControllerProvider);

    return TextButton.icon(
      onPressed: () => _choose(context, ref, current),
      icon: const Icon(Icons.language_rounded, size: AppSizes.iconSm),
      // Joriy tilning O'Z nomi: "Русский", "Oʻzbekcha". Tarjima
      // qilingan nom ("Rus tili") bu yerda foydasiz — tilni
      // bilmaydigan odam uni o'qiy olmaydi
      label: Text(_nameOf(current)),
    );
  }

  Future<void> _choose(BuildContext context, WidgetRef ref, AppLocale current) async {
    final selected = await showModalBottomSheet<AppLocale>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpacing.md),
            Text(
              AppLocalizations.of(sheetContext).languageChoose,
              style: Theme.of(sheetContext).textTheme.titleMedium,
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final value in AppLocale.values)
              ListTile(
                title: Text(_nameOf(value)),
                trailing: value == current
                    ? const Icon(Icons.check_rounded, color: AppColors.primary)
                    : null,
                onTap: () => Navigator.of(sheetContext).pop(value),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );

    if (selected != null) {
      await ref.read(localeControllerProvider.notifier).change(selected);
    }
  }

  /// Har bir til O'Z tilida yoziladi.
  static String _nameOf(AppLocale locale) => switch (locale) {
        AppLocale.uz => 'Oʻzbekcha',
        AppLocale.ru => 'Русский',
        AppLocale.en => 'English',
      };
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

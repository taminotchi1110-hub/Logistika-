import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/config/app_config.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/phone.dart';
import '../../../shared/widgets/app_button.dart';
import '../domain/user.dart';

/// SMS kodini kiritish.
///
/// DIZAYN QARORLARI:
///
///   1. **Bitta maydon, 6 ta katak ko'rinishida.** Alohida 6 ta
///      `TextField` — klaviatura va nusxa-joylashtirish bilan doim
///      muammo beradi. Bitta yashirin maydon + chizilgan kataklar
///      ishonchli ishlaydi.
///   2. **Avtomatik yuborish.** 6-raqam kiritilishi bilan tasdiqlash
///      boshlanadi — "Tasdiqlash" tugmasini bosish shart emas.
///   3. **Qayta yuborish taymeri.** Backend 60 soniya cooldown qo'yadi;
///      tugma o'sha vaqtgacha o'chirilgan turadi va sanoq ko'rsatiladi.
///   4. **Dev rejimida kod ekranda.** `devCode` faqat ishlab chiqish
///      muhitida keladi — sinovni sezilarli tezlashtiradi.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({required this.challenge, super.key});

  final OtpChallenge challenge;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  static const _codeLength = 6;

  bool _loading = false;
  String? _error;

  Timer? _timer;
  int _secondsLeft = 0;

  @override
  void initState() {
    super.initState();
    _startCooldown(widget.challenge.resendAfterSeconds);
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _startCooldown(int seconds) {
    _timer?.cancel();
    setState(() => _secondsLeft = seconds);

    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      if (_secondsLeft <= 1) {
        timer.cancel();
        setState(() => _secondsLeft = 0);
      } else {
        setState(() => _secondsLeft--);
      }
    });
  }

  Future<void> _verify(String code) async {
    if (code.length != _codeLength || _loading) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final isNew = await ref.read(authStateProvider.notifier).verifyOtp(
            phone: widget.challenge.phone,
            code: code,
          );

      if (!mounted) return;
      // Yangi foydalanuvchi profilni to'ldiradi, eskisi asosiy ekranga.
      // Router `authStateProvider` ga qarab o'zi yo'naltiradi, lekin
      // stack'ni tozalash uchun aniq ko'rsatamiz.
      context.go(isNew ? '/auth/profile' : '/');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = localizeError(error);
        _controller.clear();
      });
      // Xatodan keyin klaviatura ochiq qoladi — foydalanuvchi darhol
      // qayta kirita oladi
      _focus.requestFocus();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    if (_secondsLeft > 0) return;

    setState(() => _error = null);

    try {
      final challenge =
          await ref.read(authStateProvider.notifier).requestOtp(widget.challenge.phone);
      if (!mounted) return;

      _startCooldown(challenge.resendAfterSeconds);
      _controller.clear();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Yangi kod yuborildi')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = localizeError(error));
      // Cooldown xatosi bo'lsa — qolgan vaqtni taymerga qo'yamiz
      final retry = error.retryAfterSeconds;
      if (retry != null) _startCooldown(retry);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(leading: const BackButton()),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Tasdiqlash kodi', style: theme.textTheme.headlineLarge),
              const SizedBox(height: AppSpacing.sm),
              Text.rich(
                TextSpan(
                  text: 'Kod yuborildi: ',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                  children: [
                    TextSpan(
                      text: formatPhone(widget.challenge.phone),
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: AppSpacing.xxxl),

              _CodeInput(
                controller: _controller,
                focusNode: _focus,
                length: _codeLength,
                hasError: _error != null,
                onCompleted: _verify,
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
              ),

              if (_error != null) ...[
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    const Icon(
                      Icons.error_outline_rounded,
                      size: AppSizes.iconSm,
                      color: AppColors.danger,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(
                        _error!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.danger,
                        ),
                      ),
                    ),
                  ],
                ),
              ],

              // Dev rejimida kod ekranda — sinovni tezlashtiradi
              if (AppConfig.isDevelopment && widget.challenge.devCode != null) ...[
                const SizedBox(height: AppSpacing.lg),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.warningLight,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.code_rounded,
                        size: AppSizes.iconSm,
                        color: AppColors.warning,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          'Dev rejimi — kod: ${widget.challenge.devCode}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          _controller.text = widget.challenge.devCode!;
                          _verify(widget.challenge.devCode!);
                        },
                        child: const Text('Qoʻyish'),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: AppSpacing.xl),

              Center(
                child: _secondsLeft > 0
                    ? Text(
                        'Qayta yuborish: $_secondsLeft soniya',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      )
                    : TextButton.icon(
                        onPressed: _resend,
                        icon: const Icon(Icons.refresh_rounded, size: AppSizes.iconSm),
                        label: const Text('Kodni qayta yuborish'),
                      ),
              ),

              const Spacer(),

              AppButton(
                label: 'Tasdiqlash',
                isLoading: _loading,
                onPressed: _controller.text.length == _codeLength
                    ? () => _verify(_controller.text)
                    : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Kod kiritish maydoni: bitta `TextField`, 6 ta katak ko'rinishida.
class _CodeInput extends StatefulWidget {
  const _CodeInput({
    required this.controller,
    required this.focusNode,
    required this.length,
    required this.onCompleted,
    required this.onChanged,
    this.hasError = false,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final int length;
  final ValueChanged<String> onCompleted;
  final ValueChanged<String> onChanged;
  final bool hasError;

  @override
  State<_CodeInput> createState() => _CodeInputState();
}

class _CodeInputState extends State<_CodeInput> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    setState(() {});
    widget.onChanged(widget.controller.text);
    if (widget.controller.text.length == widget.length) {
      widget.onCompleted(widget.controller.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final code = widget.controller.text;

    return Stack(
      children: [
        // Ko'rinmas haqiqiy maydon — klaviatura va SMS avtomatik
        // to'ldirish shu bilan ishlaydi
        Opacity(
          opacity: 0,
          child: TextField(
            controller: widget.controller,
            focusNode: widget.focusNode,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(widget.length),
            ],
          ),
        ),
        GestureDetector(
          onTap: widget.focusNode.requestFocus,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(widget.length, (index) {
              final filled = index < code.length;
              final isCurrent = index == code.length && widget.focusNode.hasFocus;

              return AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                width: 48,
                height: 60,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  border: Border.all(
                    color: widget.hasError
                        ? AppColors.danger
                        : isCurrent
                            ? AppColors.primary
                            : filled
                                ? AppColors.gray300
                                : AppColors.border,
                    width: isCurrent || widget.hasError ? 2 : 1,
                  ),
                ),
                child: Text(
                  filled ? code[index] : '',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                ),
              );
            }),
          ),
        ),
      ],
    );
  }
}

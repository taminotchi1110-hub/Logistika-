import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_button.dart';
import '../domain/user.dart';

/// Ism va rol tanlash — ro'yxatdan o'tishning oxirgi qadami.
///
/// ROL TANLASH ENG MUHIM QADAM: butun ilova interfeysi shunga qarab
/// o'zgaradi. Shuning uchun u kichik ochiluvchi ro'yxat emas, katta
/// va tushunarli kartochkalar bilan beriladi. Har bir kartochkada
/// "nima qila olasiz" yozuvi bor — foydalanuvchi atamalarni emas,
/// natijani ko'radi.
///
/// "Ikkalasi" varianti alohida ajratilgan: O'zbekistonda kichik biznes
/// egasi o'z yukini tashiydi va bo'sh qaytishda boshqalarnikini oladi.
class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  UserRole? _role;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _role != null &&
      _firstName.text.trim().length >= 2 &&
      _lastName.text.trim().length >= 2;

  Future<void> _submit() async {
    if (!_canSubmit || !(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(authStateProvider.notifier).completeProfile(
            firstName: _firstName.text.trim(),
            lastName: _lastName.text.trim(),
            role: _role!,
          );
      if (mounted) context.go('/');
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

    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            children: [
              Text('Oʻzingiz haqingizda', style: theme.textTheme.headlineMedium),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Hamkoringiz sizni shu nom bilan koʻradi',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),

              TextFormField(
                controller: _firstName,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Ism'),
                validator: (value) =>
                    (value?.trim().length ?? 0) < 2 ? 'Ismni kiriting' : null,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpacing.lg),

              TextFormField(
                controller: _lastName,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Familiya'),
                validator: (value) =>
                    (value?.trim().length ?? 0) < 2 ? 'Familiyani kiriting' : null,
                onChanged: (_) => setState(() {}),
              ),

              const SizedBox(height: AppSpacing.xxxl),

              Text('Siz kimsiz?', style: theme.textTheme.headlineMedium),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Keyinchalik sozlamalardan oʻzgartirishingiz mumkin',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),

              _RoleCard(
                role: UserRole.shipper,
                icon: Icons.inventory_2_outlined,
                title: 'Yuk beruvchi',
                description: 'Yuk eʼlon qilaman va haydovchi topaman',
                selected: _role == UserRole.shipper,
                onTap: () => setState(() => _role = UserRole.shipper),
              ),
              const SizedBox(height: AppSpacing.md),

              _RoleCard(
                role: UserRole.driver,
                icon: Icons.local_shipping_outlined,
                title: 'Haydovchi',
                description: 'Yuk tashiyman va daromad qilaman',
                selected: _role == UserRole.driver,
                onTap: () => setState(() => _role = UserRole.driver),
              ),
              const SizedBox(height: AppSpacing.md),

              _RoleCard(
                role: UserRole.both,
                icon: Icons.swap_horiz_rounded,
                title: 'Ikkalasi',
                description: 'Yuk ham beraman, ham tashiyman',
                selected: _role == UserRole.both,
                onTap: () => setState(() => _role = UserRole.both),
              ),

              if (_error != null) ...[
                const SizedBox(height: AppSpacing.lg),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.dangerLight,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.error_outline_rounded,
                        size: AppSizes.iconSm,
                        color: AppColors.danger,
                      ),
                      const SizedBox(width: AppSpacing.sm),
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
                ),
              ],

              const SizedBox(height: AppSpacing.xxxl),

              AppButton(
                label: 'Boshlash',
                isLoading: _loading,
                onPressed: _canSubmit ? _submit : null,
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.role,
    required this.icon,
    required this.title,
    required this.description,
    required this.selected,
    required this.onTap,
  });

  final UserRole role;
  final IconData icon;
  final String title;
  final String description;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: selected ? AppColors.primaryLight : AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.border,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: selected ? AppColors.primary : AppColors.gray100,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Icon(
                  icon,
                  color: selected ? AppColors.white : AppColors.gray500,
                  size: AppSizes.iconMd,
                ),
              ),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(
                      description,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              // Tanlanganini ko'rsatuvchi belgi — rang yolg'iz ma'no
              // tashimasligi kerak (dalton foydalanuvchilar uchun)
              Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_unchecked_rounded,
                color: selected ? AppColors.primary : AppColors.gray300,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

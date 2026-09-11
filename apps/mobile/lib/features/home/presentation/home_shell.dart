import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_states.dart';
import '../../auth/domain/user.dart';
import '../../chat/presentation/conversations_screen.dart';
import '../../loads/presentation/feed_screen.dart';
import '../../loads/presentation/my_loads_screen.dart';
import '../../orders/presentation/orders_screen.dart';
import '../../profile/presentation/profile_providers.dart';
import 'package:karvon/core/l10n/formatters.dart';
import 'package:karvon/l10n/app_localizations.dart';

/// Asosiy ekran — pastki navigatsiya bilan.
///
/// TABLAR ROLGA QARAB O'ZGARADI:
///
///   Yuk beruvchi: Yuklarim · Buyurtmalar · Xabarlar · Profil
///   Haydovchi:    Lenta · Buyurtmalar · Xabarlar · Profil
///   Ikkalasi:     ikkala rejim orasida almashtirgich bilan
///
/// NEGA ROLGA QARAB: haydovchiga "yuk e'lon qilish" tugmasi kerak
/// emas, yuk beruvchiga esa "lenta" — ular hech qachon ishlatmaydi.
/// Keraksiz tab har kuni ko'rinib turadi va interfeysni chalkashtiradi.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  /// "Ikkalasi" rolidagi foydalanuvchi qaysi rejimda ishlayapti.
  ///
  /// Bu tanlov saqlanadi: haydovchi sifatida ishlayotgan odam ilovani
  /// har ochganda rejimni qayta tanlashi kerak emas.
  bool _driverMode = false;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);

    if (user == null) {
      return const Scaffold(body: LoadingState());
    }

    // "Ikkalasi" bo'lsa — almashtirgich bilan; aks holda roldan kelib chiqadi
    final isDriverView = user.role == UserRole.both
        ? _driverMode
        : user.role == UserRole.driver;

    final tabs = isDriverView ? _driverTabs : _shipperTabs;
    final safeIndex = _index.clamp(0, tabs.length - 1);

    return Scaffold(
      body: IndexedStack(
        index: safeIndex,
        children: [
          for (final tab in tabs) tab.builder(context),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: safeIndex,
        onTap: (index) => setState(() => _index = index),
        items: [
          for (final tab in tabs)
            BottomNavigationBarItem(
              icon: Icon(tab.icon),
              activeIcon: Icon(tab.activeIcon),
              label: tab.label,
            ),
        ],
      ),
      // "Ikkalasi" roli uchun rejim almashtirgichi
      floatingActionButton: user.role == UserRole.both && safeIndex == 0
          ? FloatingActionButton.extended(
              onPressed: () => setState(() {
                _driverMode = !_driverMode;
                _index = 0;
              }),
              backgroundColor: AppColors.gray900,
              icon: const Icon(Icons.swap_horiz_rounded, color: AppColors.white),
              label: Text(
                isDriverView ? context.l10n.modeShipper : context.l10n.modeDriver,
                style: const TextStyle(color: AppColors.white),
              ),
            )
          : null,
    );
  }

  List<_Tab> get _shipperTabs => [
        _Tab(
          label: context.l10n.tabMyLoads,
          icon: Icons.inventory_2_outlined,
          activeIcon: Icons.inventory_2_rounded,
          builder: (_) => const MyLoadsScreen(),
        ),
        _Tab(
          label: context.l10n.tabOrders,
          icon: Icons.receipt_long_outlined,
          activeIcon: Icons.receipt_long_rounded,
          builder: (_) => const OrdersScreen(),
        ),
        _Tab(
          label: context.l10n.tabMessages,
          icon: Icons.chat_bubble_outline_rounded,
          activeIcon: Icons.chat_bubble_rounded,
          builder: (_) => const ConversationsScreen(),
        ),
        _Tab(
          label: context.l10n.tabProfile,
          icon: Icons.person_outline_rounded,
          activeIcon: Icons.person_rounded,
          builder: (_) => const ProfileTab(),
        ),
      ];

  List<_Tab> get _driverTabs => [
        _Tab(
          label: context.l10n.tabFeed,
          icon: Icons.explore_outlined,
          activeIcon: Icons.explore_rounded,
          builder: (_) => const FeedScreen(),
        ),
        // Bir xil ekran, boshqa sarlavha: haydovchi uchun bu "reys",
        // mijoz uchun "buyurtma" — atama bozorda shunday ishlatiladi
        _Tab(
          label: context.l10n.tabTrips,
          icon: Icons.local_shipping_outlined,
          activeIcon: Icons.local_shipping_rounded,
          builder: (context) => OrdersScreen(title: context.l10n.tabTrips),
        ),
        _Tab(
          label: context.l10n.tabMessages,
          icon: Icons.chat_bubble_outline_rounded,
          activeIcon: Icons.chat_bubble_rounded,
          builder: (_) => const ConversationsScreen(),
        ),
        _Tab(
          label: context.l10n.tabProfile,
          icon: Icons.person_outline_rounded,
          activeIcon: Icons.person_rounded,
          builder: (_) => const ProfileTab(),
        ),
      ];
}

class _Tab {
  const _Tab({
    required this.label,
    required this.icon,
    required this.activeIcon,
    required this.builder,
  });

  final String label;
  final IconData icon;
  final IconData activeIcon;
  final WidgetBuilder builder;
}

/// Profil — hozircha asosiy ma'lumot va chiqish.
class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final user = ref.watch(currentUserProvider);

    if (user == null) return const Scaffold(body: LoadingState());

    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileTitle)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: AppColors.primaryLight,
                child: Text(
                  user.initials,
                  style: theme.textTheme.headlineMedium?.copyWith(
                    color: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user.fullName, style: theme.textTheme.titleLarge),
                    const SizedBox(height: 2),
                    Text(
                      user.role.localized(l10n),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    // Yangi foydalanuvchida "0.0 ★" yomon baho kabi
                    // ko'rinadi — shuning uchun "Yangi" deb yoziladi
                    if (user.hasRating)
                      Row(
                        children: [
                          const Icon(
                            Icons.star_rounded,
                            size: AppSizes.iconSm,
                            color: AppColors.accent,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            l10n.profileRatingSummary(user.ratingAvg.toStringAsFixed(1), user.ratingCount),
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      )
                    else
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.infoLight,
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                        child: Text(
                          l10n.profileNewUser,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.info,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xxl),
          const Divider(),

          // Haydovchi boʻlimi — tayyorlik, transport va yoʻnalishlar.
          // Yetishmayotgan qadam borligi shu yerda darhol koʻrinadi,
          // aks holda haydovchi nega taklif yubora olmayotganini
          // qidirib yuradi
          if (user.role.canDrive) ...[
            const _DriverProfileTile(),
            const Divider(),
          ],

          ListTile(
            leading: const Icon(Icons.account_balance_wallet_outlined),
            title: Text(l10n.menuWallet),
            subtitle: Text(l10n.menuWalletSubtitle),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.push('/wallet'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.person_outline_rounded),
            title: Text(l10n.menuMyData),
            subtitle: Text(user.fullName),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _editProfile(context, ref, user),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout_rounded, color: AppColors.danger),
            title: Text(l10n.actionLogout, style: const TextStyle(color: AppColors.danger)),
            onTap: () => _confirmLogout(context, ref),
          ),
        ],
      ),
    );
  }

  /// Ism va familiyani tahrirlash.
  ///
  /// Telefon raqami OʻZGARTIRILMAYDI: u sessiya va bildirishnomalar
  /// kaliti. Almashtirish uchun qayta tasdiqlash oqimi kerak — bu
  /// alohida ish.
  Future<void> _editProfile(BuildContext context, WidgetRef ref, AppUser user) async {
    final firstName = TextEditingController(text: user.firstName ?? '');
    final lastName = TextEditingController(text: user.lastName ?? '');

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context).menuMyData),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: firstName,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: AppLocalizations.of(context).fieldFirstName),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: lastName,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: AppLocalizations.of(context).fieldLastName),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                const Icon(
                  Icons.phone_outlined,
                  size: AppSizes.iconSm,
                  color: AppColors.gray400,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    AppLocalizations.of(context).phoneNotEditable(user.phone),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(AppLocalizations.of(context).actionCancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(AppLocalizations.of(context).actionSave),
          ),
        ],
      ),
    );

    if (saved != true || !context.mounted) return;

    try {
      final updated = await ref.read(profileRepositoryProvider).updateProfile(
            firstName: firstName.text,
            lastName: lastName.text,
          );
      ref.read(authStateProvider.notifier).setUser(updated);
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(context, error)),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context).actionLogout),
        content: Text(AppLocalizations.of(context).logoutConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(AppLocalizations.of(context).actionCancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              AppLocalizations.of(context).actionLogout,
              style: const TextStyle(color: AppColors.danger),
            ),
          ),
        ],
      ),
    );

    if (confirmed ?? false) {
      await ref.read(authStateProvider.notifier).logout();
    }
  }
}

/// Haydovchi bo'limiga o'tish.
///
/// Yetishmayotgan qadamlar soni shu yerda ko'rsatiladi: haydovchi
/// nega taklif yubora olmayotganini qidirib yurmasligi kerak.
class _DriverProfileTile extends ConsumerWidget {
  const _DriverProfileTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final readiness = ref.watch(driverReadinessProvider).valueOrNull;
    final missing = readiness?.missingSteps.length ?? 0;
    final ready = readiness?.canSendOffers ?? false;

    return ListTile(
      leading: const Icon(Icons.local_shipping_outlined),
      title: Text(context.l10n.driverProfileTitle),
      subtitle: Text(
        ready
            ? context.l10n.driverReadyAll
            : missing > 0
                ? context.l10n.driverStepsLeft(missing)
                : context.l10n.driverVehicleAndRoutes,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!ready && missing > 0)
            Container(
              padding: const EdgeInsets.all(6),
              decoration: const BoxDecoration(
                color: AppColors.warning,
                shape: BoxShape.circle,
              ),
              constraints: const BoxConstraints(minWidth: 22, minHeight: 22),
              child: Text(
                '$missing',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
          const SizedBox(width: AppSpacing.sm),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
      onTap: () => context.push('/driver-profile'),
    );
  }
}

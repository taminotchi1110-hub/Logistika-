import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_states.dart';
import '../../auth/domain/user.dart';
import '../../offers/presentation/send_offer_sheet.dart';
import '../domain/load.dart';
import 'feed_screen.dart';

/// Bitta yuk uchun tafsilotlar (`autoDispose` — ekran yopilganda tozalanadi).
final loadDetailProvider =
    FutureProvider.autoDispose.family<Load, String>((ref, id) {
  return ref.watch(loadsRepositoryProvider).byId(id);
});

/// Yuk tafsilotlari.
///
/// AXBOROT TARTIBI qaror qabul qilish tartibiga mos:
///   1. Marshrut va narx — "arziydimi?"
///   2. Yuk tavsifi va og'irlik — "ko'tara olamanmi?"
///   3. Vaqt — "ulguramanmi?"
///   4. Manzil va kontakt — "qanday boraman?"
///
/// KONTAKT TELEFONI MASKALANGAN. To'liq raqam faqat haydovchi olish
/// nuqtasiga yetib borganda ochiladi — bu platformaning asosiy
/// qoidalaridan biri (docs/04 va docs/15). Shu sababli bu yerda
/// "Bogʻlanish" tugmasi yo'q: muloqot buyurtma tuzilgandan keyin
/// chat orqali boshlanadi.
class LoadDetailScreen extends ConsumerWidget {
  const LoadDetailScreen({required this.loadId, super.key});

  final String loadId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final load = ref.watch(loadDetailProvider(loadId));
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Yuk tafsilotlari')),
      body: load.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(loadDetailProvider(loadId)),
        ),
        data: (data) => _Content(load: data),
      ),
      bottomNavigationBar: load.maybeWhen(
        data: (data) => _ActionBar(load: data, user: user),
        orElse: () => null,
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.load});

  final Load load;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        // --- narx ---
        Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: AppColors.primaryLight,
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      load.hasPrice
                          ? formatSoum(load.priceTiyin)
                          : 'Kelishuv asosida',
                      style: theme.textTheme.displayMedium?.copyWith(
                        color: AppColors.primaryDark,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    if (load.distanceKm != null && load.hasPrice)
                      Text(
                        _perKm(load),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppColors.primaryDark,
                        ),
                      ),
                  ],
                ),
              ),
              if (load.isEscrow)
                const Column(
                  children: [
                    Icon(Icons.verified_user_rounded, color: AppColors.primary),
                    SizedBox(height: AppSpacing.xs),
                    Text(
                      'Kafolatli\ntoʻlov',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: AppColors.primaryDark),
                    ),
                  ],
                ),
            ],
          ),
        ),

        const SizedBox(height: AppSpacing.lg),

        // --- marshrut ---
        _Card(
          child: Column(
            children: [
              _RoutePoint(
                icon: Icons.trip_origin_rounded,
                color: AppColors.success,
                label: 'Olish',
                address: load.pickup.address,
                region: load.pickup.regionName,
                contactName: load.pickup.contactName,
                contactPhone: load.pickup.contactPhone,
              ),
              // Bogʻlovchi chiziq — marshrut ekanini koʻrsatadi
              Padding(
                padding: const EdgeInsets.only(left: 11),
                child: Row(
                  children: [
                    Container(width: 2, height: 28, color: AppColors.border),
                    const SizedBox(width: AppSpacing.lg),
                    if (load.distanceKm != null)
                      Text(
                        '${formatDistance(load.distanceKm)} · ${formatDuration(load.durationMin)}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
              _RoutePoint(
                icon: Icons.place_rounded,
                color: AppColors.danger,
                label: 'Yetkazish',
                address: load.delivery.address,
                region: load.delivery.regionName,
                contactName: load.delivery.contactName,
                contactPhone: load.delivery.contactPhone,
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpacing.lg),

        // --- yuk ---
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(load.title, style: theme.textTheme.titleLarge),
              if (load.categoryName != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  load.categoryName!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              Wrap(
                spacing: AppSpacing.xxl,
                runSpacing: AppSpacing.md,
                children: [
                  _Spec(label: 'Ogʻirlik', value: formatWeight(load.weightKg)),
                  if (load.volumeM3 != null)
                    _Spec(label: 'Hajm', value: '${load.volumeM3} m³'),
                  _Spec(
                    label: 'Toʻlov',
                    value: switch (load.paymentMethod) {
                      'ESCROW' => 'Kafolatli',
                      'CARD' => 'Karta',
                      'BANK_TRANSFER' => 'Bank',
                      _ => 'Naqd',
                    },
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpacing.lg),

        // --- vaqt ---
        _Card(
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: load.isUrgent ? AppColors.warningLight : AppColors.gray100,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Icon(
                  load.isUrgent ? Icons.bolt_rounded : Icons.schedule_rounded,
                  color: load.isUrgent ? AppColors.warning : AppColors.gray500,
                ),
              ),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Yuklash vaqti', style: theme.textTheme.labelMedium),
                    Text(
                      _window(load),
                      style: theme.textTheme.titleMedium,
                    ),
                    if (load.isUrgent)
                      Text(
                        'Shoshilinch — tez qaror qiling',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.warning,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpacing.lg),

        // --- statistika ---
        Row(
          children: [
            Expanded(
              child: _Stat(
                icon: Icons.visibility_outlined,
                value: '${load.viewCount}',
                label: 'koʻrildi',
              ),
            ),
            Expanded(
              child: _Stat(
                icon: Icons.local_offer_outlined,
                value: '${load.offerCount}',
                label: 'taklif',
              ),
            ),
            if (load.distanceToPickupKm != null)
              Expanded(
                child: _Stat(
                  icon: Icons.near_me_outlined,
                  value: formatDistance(load.distanceToPickupKm),
                  label: 'sizga',
                ),
              ),
          ],
        ),

        const SizedBox(height: AppSpacing.xxxl),
      ],
    );
  }

  static String _perKm(Load load) {
    final tiyin = parseTiyin(load.priceTiyin);
    final km = load.distanceKm ?? 0;
    if (km <= 0) return '';

    final perKm = tiyin ~/ BigInt.from(km.round());
    return '${formatSoum(perKm)}/km · ${formatDistance(km)}';
  }

  static String _window(Load load) {
    String two(int value) => value.toString().padLeft(2, '0');

    final from = load.pickupFrom;
    final to = load.pickupTo;
    final sameDay = from.day == to.day && from.month == to.month;

    final date = '${from.day}.${two(from.month)}';
    final times = '${two(from.hour)}:${two(from.minute)} – ${two(to.hour)}:${two(to.minute)}';

    return sameDay ? '$date, $times' : '$date ${two(from.hour)}:${two(from.minute)} → '
        '${to.day}.${two(to.month)} ${two(to.hour)}:${two(to.minute)}';
  }
}

/// Amal paneli — rolga qarab.
class _ActionBar extends ConsumerWidget {
  const _ActionBar({required this.load, required this.user});

  final Load load;
  final AppUser? user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Yuk egasiga taklif yuborish tugmasi kerak emas
    final isDriver = user?.role.canDrive ?? false;
    if (!isDriver || !load.status.isOpen) return const SizedBox.shrink();

    return Container(
      padding: EdgeInsets.only(
        left: AppSpacing.lg,
        right: AppSpacing.lg,
        top: AppSpacing.md,
        bottom: MediaQuery.paddingOf(context).bottom + AppSpacing.md,
      ),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          // Xaritada ochish — haydovchi yoʻlni oldindan koʻradi
          OutlinedButton(
            onPressed: () => _openMap(load),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(AppSizes.buttonHeight, AppSizes.buttonHeight),
              padding: EdgeInsets.zero,
            ),
            child: const Icon(Icons.map_outlined),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: AppButton(
              label: 'Taklif yuborish',
              icon: Icons.send_rounded,
              onPressed: () async {
                final sent = await SendOfferSheet.show(context, load);
                if (sent ?? false) {
                  if (!context.mounted) return;
                  ref.invalidate(loadDetailProvider(load.id));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Taklif yuborildi — javobni kuting'),
                    ),
                  );
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openMap(Load load) async {
    // `geo:` sxemasi Android'da o'rnatilgan xarita ilovasini ochadi
    final uri = Uri.parse(
      'geo:${load.pickup.lat},${load.pickup.lng}'
      '?q=${load.pickup.lat},${load.pickup.lng}',
    );

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
      return;
    }

    // Zaxira: brauzerdagi OpenStreetMap
    await launchUrl(
      Uri.parse(
        'https://www.openstreetmap.org/?mlat=${load.pickup.lat}&mlon=${load.pickup.lng}#map=15/${load.pickup.lat}/${load.pickup.lng}',
      ),
      mode: LaunchMode.externalApplication,
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
  }
}

class _RoutePoint extends StatelessWidget {
  const _RoutePoint({
    required this.icon,
    required this.color,
    required this.label,
    required this.address,
    this.region,
    this.contactName,
    this.contactPhone,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String address;
  final String? region;
  final String? contactName;
  final String? contactPhone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Maskalangan raqamda yulduzcha bo'ladi
    final isMasked = contactPhone?.contains('*') ?? false;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 24, color: color),
        const SizedBox(width: AppSpacing.lg),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                region == null ? label : '$label · $region',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 2),
              Text(address, style: theme.textTheme.bodyLarge),
              if (contactName != null || contactPhone != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    const Icon(
                      Icons.person_outline_rounded,
                      size: AppSizes.iconSm,
                      color: AppColors.textSecondary,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Flexible(
                      child: Text(
                        [contactName, contactPhone].whereType<String>().join(' · '),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
                // Nega raqam yashirilganini TUSHUNTIRAMIZ — aks holda
                // haydovchi buni nosozlik deb o'ylaydi
                if (isMasked)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs),
                    child: Text(
                      'Toʻliq raqam yuklash joyiga yetib borganingizda ochiladi',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.info,
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Spec extends StatelessWidget {
  const _Spec({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        Text(value, style: theme.textTheme.titleMedium),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.value, required this.label});

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Icon(icon, size: AppSizes.iconSm, color: AppColors.textSecondary),
        const SizedBox(height: AppSpacing.xs),
        Text(value, style: theme.textTheme.titleMedium),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }
}

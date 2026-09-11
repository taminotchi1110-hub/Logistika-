import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:karvon/core/l10n/formatters.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/location/device_location.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_states.dart';
import '../../ratings/domain/rating.dart';
import '../../ratings/presentation/rate_order_sheet.dart';
import '../../ratings/presentation/rating_providers.dart';
import '../../ratings/presentation/widgets/star_rating.dart';
import '../domain/order.dart';
import 'orders_screen.dart';
import 'widgets/status_timeline.dart';
import 'order_l10n.dart';

/// Buyurtma tafsiloti — reysning boshqaruv paneli.
///
/// EKRANNING VAZIFASI: foydalanuvchi bu yerga kirib "hozir nima
/// qilishim kerak?" degan savolga darhol javob olishi kerak. Shuning
/// uchun keyingi qadam tugmasi pastda, doim ko'rinadigan joyda turadi
/// va u BITTA: ikkita bir xil ahamiyatli tugma ikkilanish tug'diradi.
class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({required this.orderId, super.key});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  bool _isSubmitting = false;

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(orderProvider(widget.orderId));

    return Scaffold(
      appBar: AppBar(
        title: order.maybeWhen(
          data: (value) => Text(context.l10n.orderTitle(value.publicNo)),
          orElse: () => Text(context.l10n.orderTitleFallback),
        ),
      ),
      body: order.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(orderProvider(widget.orderId)),
        ),
        data: _body,
      ),
      bottomNavigationBar: order.maybeWhen(
        data: _actionBar,
        orElse: () => null,
      ),
    );
  }

  Widget _body(Order order) {
    final history = ref.watch(orderHistoryEntriesProvider(widget.orderId));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(orderProvider(widget.orderId));
        ref.invalidate(orderHistoryEntriesProvider(widget.orderId));
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          _StatusHeader(order: order),
          const SizedBox(height: AppSpacing.lg),

          _Section(
            title: context.l10n.orderSectionRoute,
            child: _RouteBlock(order: order),
          ),
          // Xarita tugmasi FAQAT kuzatuv ishlayotganda: boshqa paytda
          // u boʻsh xaritaga olib boradi va "ishlamayapti" degan
          // taassurot qoldiradi
          if (order.status.isTracking) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton.secondary(
              label: context.l10n.actionTrackOnMap,
              icon: Icons.map_rounded,
              onPressed: () => context.push('/order/${order.id}/track'),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),

          _Section(
            title: order.counterparty.isDriver ? context.l10n.roleDriver : context.l10n.roleShipper,
            child: _CounterpartyBlock(
              order: order,
              onCall: _call,
              onEmergencyReveal: _emergencyReveal,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          _Section(title: context.l10n.orderSectionFinance, child: _MoneyBlock(order: order)),
          const SizedBox(height: AppSpacing.lg),

          // Baho FAQAT yuk topshirilgandan keyin: undan oldin baholash
          // uchun asos yoʻq va server ham rad etadi
          if (order.status.step >= OrderStatus.delivered.step) ...[
            _Section(
              title: context.l10n.orderSectionRating,
              child: _RatingBlock(order: order, onRate: _rate),
            ),
            const SizedBox(height: AppSpacing.lg),
          ],

          _Section(
            title: context.l10n.orderSectionSteps,
            child: StatusTimeline(
              current: order.status,
              history: history.valueOrNull ?? const [],
            ),
          ),
          const SizedBox(height: AppSpacing.xxxl),
        ],
      ),
    );
  }

  /// Pastdagi amal paneli.
  ///
  /// Keyingi qadam SERVERDAN keladi (`nextAllowed`) — ilova state
  /// machine'ni takrorlamaydi. Bekor qilish alohida, matnli tugma
  /// bo'lib pastda turadi: u tasodifan bosilmasligi kerak.
  Widget? _actionBar(Order order) {
    final forward = order.forwardTransitions;
    final cancels = order.cancelTransitions;

    if (forward.isEmpty && cancels.isEmpty) return null;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (forward.isNotEmpty)
              AppButton(
                label: forward.first.action(context.l10n),
                icon: forward.first.icon,
                isLoading: _isSubmitting,
                onPressed: _isSubmitting ? null : () => _confirmAndChange(order, forward.first),
              ),
            // Nizo va boshqa ikkilamchi o'tishlar
            if (forward.length > 1) ...[
              const SizedBox(height: AppSpacing.sm),
              for (final status in forward.skip(1))
                TextButton(
                  onPressed: _isSubmitting ? null : () => _confirmAndChange(order, status),
                  child: Text(status.action(context.l10n)),
                ),
            ],
            if (cancels.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xs),
              TextButton(
                onPressed: _isSubmitting ? null : () => _confirmAndChange(order, cancels.first),
                child: Text(
                  cancels.first.action(context.l10n),
                  style: const TextStyle(color: AppColors.danger),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Tasdiqlash so'raydi va holatni o'zgartiradi.
  ///
  /// TASDIQ FAQAT QAYTARIB BO'LMAYDIGAN QADAMLARDA: har bir bosishda
  /// dialog chiqarish haydovchini charchatadi va u o'qimasdan bosishga
  /// o'rganib qoladi — natijada tasdiq o'z ma'nosini yo'qotadi.
  Future<void> _confirmAndChange(Order order, OrderStatus next) async {
    final needsConfirm = next.isCancellation ||
        next == OrderStatus.delivered ||
        next == OrderStatus.completed ||
        next == OrderStatus.disputed;

    String? note;

    if (needsConfirm) {
      final result = await _askConfirmation(next);
      if (result == null) return;
      note = result.isEmpty ? null : result;
    }

    await _changeStatus(order, next, note: note);
  }

  /// Tasdiq oynasi. Bekor qilish va nizoda SABAB majburiy.
  Future<String?> _askConfirmation(OrderStatus next) async {
    final needsReason = next.isCancellation || next == OrderStatus.disputed;
    final controller = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(next.action(context.l10n)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_confirmationMessage(context, next)),
              const SizedBox(height: AppSpacing.lg),
              TextField(
                controller: controller,
                onChanged: (_) => setDialogState(() {}),
                maxLines: 3,
                minLines: 1,
                decoration: InputDecoration(
                  hintText: needsReason ? context.l10n.reasonRequiredHint : context.l10n.noteOptionalHint,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(context.l10n.actionClose),
            ),
            TextButton(
              // Sabab majburiy bo'lsa 5 belgidan kam matn qabul qilinmaydi:
              // "yo'q" degan sabab nizoda hech narsa tushuntirmaydi
              onPressed: needsReason && controller.text.trim().length < 5
                  ? null
                  : () => Navigator.pop(context, true),
              child: Text(
                next.isCancellation ? context.l10n.orderActionCancel : context.l10n.actionConfirm,
                style: TextStyle(
                  color: next.isCancellation ? AppColors.danger : AppColors.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );

    if (confirmed != true) return null;
    return controller.text.trim();
  }

  String _confirmationMessage(BuildContext context, OrderStatus next) => switch (next) {
        OrderStatus.delivered => context.l10n.confirmDelivered,
        OrderStatus.completed => context.l10n.confirmCompleted,
        OrderStatus.disputed => context.l10n.confirmDisputed,
        _ => context.l10n.confirmCancelOrder,
      };

  Future<void> _changeStatus(Order order, OrderStatus next, {String? note}) async {
    setState(() => _isSubmitting = true);

    // Koordinata ixtiyoriy: GPS oʻchiq boʻlsa ham reys toʻxtamasligi kerak
    final position = await ref.read(locationResolverProvider)();

    try {
      await ref.read(ordersRepositoryProvider).changeStatus(
            order.id,
            next,
            note: note,
            lat: position?.lat,
            lng: position?.lng,
          );

      if (!mounted) return;
      _refreshAll();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(next.localized(context.l10n))),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      // Holat boshqa qurilmadan oʻzgargan boʻlishi mumkin — yangilaymiz
      if (error.code == 'ORDER_INVALID_TRANSITION') _refreshAll();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(context, error)),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _refreshAll() {
    ref.invalidate(orderProvider(widget.orderId));
    ref.invalidate(orderHistoryEntriesProvider(widget.orderId));
    ref.invalidate(activeOrdersProvider);
    ref.invalidate(orderHistoryProvider);
  }

  /// Baho oynasini ochadi.
  ///
  /// `counterparty.isDriver` — hamkor haydovchi, demak foydalanuvchi
  /// mijoz va u HAYDOVCHINI baholaydi.
  Future<void> _rate(Order order) async {
    final done = await showRateOrderSheet(
      context,
      orderId: order.id,
      counterpartyName: order.counterparty.fullName,
      isRatingDriver: order.counterparty.isDriver,
    );

    if ((done ?? false) && mounted) {
      ref.invalidate(orderRatingsProvider(order.id));
    }
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    if (!await launchUrl(uri)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.callFailed)),
      );
    }
  }

  /// "Bogʻlana olmayapman" — raqamni muddatidan oldin ochish.
  Future<void> _emergencyReveal(Order order) async {
    final controller = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(context.l10n.emergencyTitle),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(context.l10n.emergencyBody),
              const SizedBox(height: AppSpacing.lg),
              TextField(
                controller: controller,
                onChanged: (_) => setDialogState(() {}),
                maxLines: 3,
                minLines: 1,
                decoration: InputDecoration(
                  hintText: context.l10n.emergencyHint,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(context.l10n.actionClose),
            ),
            TextButton(
              onPressed: controller.text.trim().length < 5
                  ? null
                  : () => Navigator.pop(context, true),
              child: Text(context.l10n.actionReveal),
            ),
          ],
        ),
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      await ref
          .read(ordersRepositoryProvider)
          .revealContacts(order.id, controller.text.trim());

      if (!mounted) return;
      _refreshAll();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(context, error)),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }
}

// =====================================================================
//  Bloklar
// =====================================================================

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: order.status.color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: order.status.color,
              shape: BoxShape.circle,
            ),
            child: Icon(order.status.icon, color: AppColors.white),
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.statusText(context.l10n),
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: order.status.color,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  order.load.title,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteBlock extends StatelessWidget {
  const _RouteBlock({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Point(
          icon: Icons.trip_origin_rounded,
          color: AppColors.primary,
          title: order.load.pickupAddress,
          contactName: order.load.pickupContactName,
          // Telefon YOPIQ bo'lsa server maskalangan qiymat qaytaradi —
          // ilova o'zi hech narsa yashirmaydi
          contactPhone: order.load.pickupContactPhone,
          isRevealed: order.visibility.pickupPhone,
        ),
        Padding(
          padding: const EdgeInsets.only(left: 11),
          child: Container(width: 2, height: 24, color: AppColors.gray200),
        ),
        _Point(
          icon: Icons.place_rounded,
          color: AppColors.success,
          title: order.load.deliveryAddress,
          contactName: order.load.deliveryContactName,
          contactPhone: order.load.deliveryContactPhone,
          isRevealed: order.visibility.deliveryPhone,
        ),
        if (order.load.distanceKm != null) ...[
          const SizedBox(height: AppSpacing.md),
          const Divider(height: 1),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              const Icon(Icons.route_rounded, size: AppSizes.iconSm, color: AppColors.gray400),
              const SizedBox(width: AppSpacing.xs),
              Text(context.distance(order.load.distanceKm), style: theme.textTheme.bodyMedium),
              const SizedBox(width: AppSpacing.lg),
              const Icon(Icons.schedule_rounded, size: AppSizes.iconSm, color: AppColors.gray400),
              const SizedBox(width: AppSpacing.xs),
              Text(context.duration(order.load.durationMin), style: theme.textTheme.bodyMedium),
              const Spacer(),
              Text(context.weight(order.load.weightKg), style: theme.textTheme.bodyMedium),
            ],
          ),
        ],
      ],
    );
  }
}

class _Point extends StatelessWidget {
  const _Point({
    required this.icon,
    required this.color,
    required this.title,
    required this.isRevealed,
    this.contactName,
    this.contactPhone,
  });

  final IconData icon;
  final Color color;
  final String title;
  final bool isRevealed;
  final String? contactName;
  final String? contactPhone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: AppSizes.iconMd, color: color),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: theme.textTheme.bodyLarge),
              if (contactName != null || contactPhone != null) ...[
                const SizedBox(height: 2),
                Text(
                  [
                    if (contactName != null && contactName!.isNotEmpty) contactName,
                    if (contactPhone != null && contactPhone!.isNotEmpty) contactPhone,
                  ].join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: isRevealed ? AppColors.textPrimary : AppColors.textSecondary,
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

class _CounterpartyBlock extends StatelessWidget {
  const _CounterpartyBlock({
    required this.order,
    required this.onCall,
    required this.onEmergencyReveal,
  });

  final Order order;
  final void Function(String phone) onCall;
  final void Function(Order order) onEmergencyReveal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final party = order.counterparty;
    final revealed = order.visibility.counterpartyPhone;

    return Column(
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: AppColors.primaryLight,
              child: Text(
                party.initials,
                style: theme.textTheme.titleSmall?.copyWith(color: AppColors.primary),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(party.fullName, style: theme.textTheme.bodyLarge),
                  const SizedBox(height: 2),
                  if (party.hasRating)
                    Row(
                      children: [
                        const Icon(Icons.star_rounded, size: 14, color: AppColors.accent),
                        const SizedBox(width: 2),
                        Text(
                          context.l10n.profileRatingSummary(party.ratingAvg.toStringAsFixed(1), party.ratingCount),
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    )
                  else
                    Text(
                      context.l10n.profileNewUser,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                ],
              ),
            ),
            Text(
              party.phone,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: revealed ? AppColors.textPrimary : AppColors.textSecondary,
              ),
            ),
          ],
        ),
        if (order.vehicle != null) ...[
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              const Icon(
                Icons.local_shipping_outlined,
                size: AppSizes.iconSm,
                color: AppColors.gray400,
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(order.vehicle!.title, style: theme.textTheme.bodyMedium),
              const Spacer(),
              Text(
                order.vehicle!.plateFormatted,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            if (revealed)
              Expanded(
                child: AppButton.secondary(
                  label: context.l10n.actionCall,
                  icon: Icons.call_rounded,
                  onPressed: () => onCall(party.phone),
                ),
              )
            else if (order.visibility.emergencyRevealAvailable)
              // Raqam hali yopiq — sababli ochish klapani
              Expanded(
                child: AppButton.secondary(
                  label: context.l10n.emergencyTitle,
                  icon: Icons.phone_disabled_rounded,
                  onPressed: () => onEmergencyReveal(order),
                ),
              ),
            if (order.visibility.chatEnabled) ...[
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: AppButton(
                  label: context.l10n.actionMessage,
                  icon: Icons.chat_bubble_rounded,
                  // Chat buyurtma qabul qilinganda ochiladi va telefon
                  // ochilgunicha yagona muloqot yoʻli boʻladi
                  onPressed: order.conversationId == null
                      ? null
                      : () => context.push('/chat/${order.conversationId}'),
                ),
              ),
            ],
          ],
        ),
        if (!revealed && order.visibility.chatEnabled) ...[
          const SizedBox(height: AppSpacing.md),
          Text(
            context.l10n.phoneHiddenUntilPickup,
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ],
    );
  }
}

/// Baho bloki.
///
/// UCH HOLAT BOR VA UCHALASI HAM AYTILADI:
///   1. Baho berilmagan — tugma.
///   2. Berilgan, lekin hamkor javob bermagan — "yashirin turibdi".
///   3. Ikkalasi ham bergan — baholar ko'rinadi.
///
/// Ikkinchi holatni yashirish eng ko'p savol tug'diradigan xato
/// bo'lardi: foydalanuvchi baho yuborgan, lekin hech qayerda
/// ko'rmagan va uni qayta yuborishga uringan bo'lardi.
class _RatingBlock extends ConsumerWidget {
  const _RatingBlock({required this.order, required this.onRate});

  final Order order;
  final void Function(Order order) onRate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final ratings = ref.watch(orderRatingsProvider(order.id));

    return ratings.when(
      loading: () => const SizedBox(
        height: 40,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
      ),
      error: (_, __) => Text(
        context.l10n.ratingsLoadFailed,
        style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary),
      ),
      data: (items) {
        // O'z bahom — server faqat ko'rish huquqi bor baholarni beradi,
        // shuning uchun yo'nalish bo'yicha ajratamiz
        final ratingDriver = order.counterparty.isDriver;
        final mine = items.where(
          (item) => item.direction.isFromShipper == ratingDriver,
        );
        final theirs = items.where(
          (item) => item.direction.isFromShipper != ratingDriver,
        );

        if (mine.isEmpty) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.ratingPrompt,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: context.l10n.actionRate,
                icon: Icons.star_rounded,
                onPressed: () => onRate(order),
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _RatingRow(title: context.l10n.ratingMine, rating: mine.first),
            const SizedBox(height: AppSpacing.md),
            if (theirs.isEmpty)
              Row(
                children: [
                  const Icon(
                    Icons.visibility_off_outlined,
                    size: AppSizes.iconSm,
                    color: AppColors.gray400,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      context.l10n.ratingTheirsHidden,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              )
            else
              _RatingRow(title: context.l10n.ratingTheirs, rating: theirs.first),
          ],
        );
      },
    );
  }
}

class _RatingRow extends StatelessWidget {
  const _RatingRow({required this.title, required this.rating});

  final String title;
  final Rating rating;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
            StarRatingDisplay(value: rating.score),
          ],
        ),
        if (rating.hasComment) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(rating.comment!, style: theme.textTheme.bodyMedium),
        ],
      ],
    );
  }
}

class _MoneyBlock extends StatelessWidget {
  const _MoneyBlock({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Haydovchiga qo'lga tegadigan summa muhim, mijozga — to'lanadigan
    final isDriver = !order.counterparty.isDriver;

    return Column(
      children: [
        _MoneyRow(
          label: context.l10n.moneyOrderPrice,
          value: context.soum(order.priceTiyin),
          isBold: !isDriver,
        ),
        if (isDriver) ...[
          const SizedBox(height: AppSpacing.sm),
          _MoneyRow(
            label: context.l10n.moneyCommission,
            value: '− ${context.soum(order.commissionTiyin)}',
            color: AppColors.textSecondary,
          ),
          const SizedBox(height: AppSpacing.sm),
          const Divider(height: 1),
          const SizedBox(height: AppSpacing.sm),
          _MoneyRow(
            label: context.l10n.moneyYouGet,
            value: context.soum(order.driverPayoutTiyin),
            isBold: true,
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Icon(
              order.isEscrow ? Icons.verified_user_rounded : Icons.payments_outlined,
              size: AppSizes.iconSm,
              color: order.isEscrow ? AppColors.primary : AppColors.gray400,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                paymentMethodNote(context.l10n, order.paymentMethod),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({
    required this.label,
    required this.value,
    this.isBold = false,
    this.color,
  });

  final String label;
  final String value;
  final bool isBold;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = isBold ? theme.textTheme.titleSmall : theme.textTheme.bodyMedium;

    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: color ?? AppColors.textSecondary,
            ),
          ),
        ),
        Text(value, style: style?.copyWith(color: color)),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

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
            const SizedBox(height: AppSpacing.lg),
            child,
          ],
        ),
      ),
    );
  }
}

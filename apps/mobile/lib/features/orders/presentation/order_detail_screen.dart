import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/location/device_location.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/order.dart';
import 'orders_screen.dart';
import 'widgets/status_timeline.dart';

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
          data: (value) => Text('Buyurtma №${value.publicNo}'),
          orElse: () => const Text('Buyurtma'),
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
            title: 'Yoʻl',
            child: _RouteBlock(order: order),
          ),
          const SizedBox(height: AppSpacing.lg),

          _Section(
            title: order.counterparty.isDriver ? 'Haydovchi' : 'Yuk beruvchi',
            child: _CounterpartyBlock(
              order: order,
              onCall: _call,
              onEmergencyReveal: _emergencyReveal,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          _Section(title: 'Moliya', child: _MoneyBlock(order: order)),
          const SizedBox(height: AppSpacing.lg),

          _Section(
            title: 'Bosqichlar',
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
                label: forward.first.actionLabel,
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
                  child: Text(status.actionLabel),
                ),
            ],
            if (cancels.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xs),
              TextButton(
                onPressed: _isSubmitting ? null : () => _confirmAndChange(order, cancels.first),
                child: Text(
                  cancels.first.actionLabel,
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
          title: Text(next.actionLabel),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_confirmationMessage(next)),
              const SizedBox(height: AppSpacing.lg),
              TextField(
                controller: controller,
                onChanged: (_) => setDialogState(() {}),
                maxLines: 3,
                minLines: 1,
                decoration: InputDecoration(
                  hintText: needsReason ? 'Sabab (majburiy)' : 'Izoh (ixtiyoriy)',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Yopish'),
            ),
            TextButton(
              // Sabab majburiy bo'lsa 5 belgidan kam matn qabul qilinmaydi:
              // "yo'q" degan sabab nizoda hech narsa tushuntirmaydi
              onPressed: needsReason && controller.text.trim().length < 5
                  ? null
                  : () => Navigator.pop(context, true),
              child: Text(
                next.isCancellation ? 'Bekor qilish' : 'Tasdiqlash',
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

  String _confirmationMessage(OrderStatus next) => switch (next) {
        OrderStatus.delivered =>
          'Yuk qabul qiluvchiga topshirilganini tasdiqlaysizmi? Bundan '
              'keyin marshrutni oʻzgartirib boʻlmaydi.',
        OrderStatus.completed =>
          'Yuk toʻliq va butun yetkazilganini tasdiqlaysizmi? Tasdiqdan '
              'keyin toʻlov haydovchiga oʻtadi.',
        OrderStatus.disputed =>
          'Nizo ochilsa buyurtma toʻxtaydi va admin koʻrib chiqadi. '
              'Muammoni batafsil yozing.',
        _ =>
          'Buyurtmani bekor qilmoqchimisiz? Bekor qilish reytingingizga '
              'taʼsir qiladi va jarima yozilishi mumkin.',
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
        SnackBar(content: Text(next.label)),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      // Holat boshqa qurilmadan oʻzgargan boʻlishi mumkin — yangilaymiz
      if (error.code == 'ORDER_INVALID_TRANSITION') _refreshAll();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(error)),
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

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    if (!await launchUrl(uri)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Qoʻngʻiroq qilib boʻlmadi')),
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
          title: const Text('Bogʻlana olmayapman'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Telefon raqami odatda yuk olish nuqtasiga yetib borgach '
                'ochiladi. Muhim sabab boʻlsa uni hozir ochish mumkin — '
                'sabab yoziladi va ikkala tomonga xabar ketadi.',
              ),
              const SizedBox(height: AppSpacing.lg),
              TextField(
                controller: controller,
                onChanged: (_) => setDialogState(() {}),
                maxLines: 3,
                minLines: 1,
                decoration: const InputDecoration(
                  hintText: 'Masalan: manzilni topa olmayapman',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Yopish'),
            ),
            TextButton(
              onPressed: controller.text.trim().length < 5
                  ? null
                  : () => Navigator.pop(context, true),
              child: const Text('Ochish'),
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
          content: Text(localizeError(error)),
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
                  order.statusLabel,
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
              Text(formatDistance(order.load.distanceKm), style: theme.textTheme.bodyMedium),
              const SizedBox(width: AppSpacing.lg),
              const Icon(Icons.schedule_rounded, size: AppSizes.iconSm, color: AppColors.gray400),
              const SizedBox(width: AppSpacing.xs),
              Text(formatDuration(order.load.durationMin), style: theme.textTheme.bodyMedium),
              const Spacer(),
              Text(formatWeight(order.load.weightKg), style: theme.textTheme.bodyMedium),
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
                          '${party.ratingAvg.toStringAsFixed(1)} · ${party.ratingCount} baho',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    )
                  else
                    Text(
                      'Yangi foydalanuvchi',
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
                  label: 'Qoʻngʻiroq',
                  icon: Icons.call_rounded,
                  onPressed: () => onCall(party.phone),
                ),
              )
            else if (order.visibility.emergencyRevealAvailable)
              // Raqam hali yopiq — sababli ochish klapani
              Expanded(
                child: AppButton.secondary(
                  label: 'Bogʻlana olmayapman',
                  icon: Icons.phone_disabled_rounded,
                  onPressed: () => onEmergencyReveal(order),
                ),
              ),
            if (order.visibility.chatEnabled) ...[
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: AppButton(
                  label: 'Xabar',
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
            'Telefon raqami haydovchi yuk olish nuqtasiga yetib borgach '
            'ochiladi. Unga qadar muloqot chat orqali.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
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
          label: 'Buyurtma narxi',
          value: formatSoum(order.priceTiyin),
          isBold: !isDriver,
        ),
        if (isDriver) ...[
          const SizedBox(height: AppSpacing.sm),
          _MoneyRow(
            label: 'Platforma komissiyasi',
            value: '− ${formatSoum(order.commissionTiyin)}',
            color: AppColors.textSecondary,
          ),
          const SizedBox(height: AppSpacing.sm),
          const Divider(height: 1),
          const SizedBox(height: AppSpacing.sm),
          _MoneyRow(
            label: 'Sizga tushadi',
            value: formatSoum(order.driverPayoutTiyin),
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
                order.isEscrow
                    ? 'Himoyalangan toʻlov — pul KARVON hisobida turadi va '
                        'yuk qabul qilingach chiqariladi'
                    : _paymentLabel(order.paymentMethod),
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

  static String _paymentLabel(String method) => switch (method) {
        'CASH' => 'Naqd toʻlov — yetkazilgach haydovchiga beriladi',
        'CARD' => 'Karta orqali toʻlov',
        'BANK_TRANSFER' => 'Bank oʻtkazmasi',
        _ => 'Toʻlov usuli koʻrsatilmagan',
      };
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

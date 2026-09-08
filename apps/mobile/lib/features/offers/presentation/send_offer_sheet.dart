import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_states.dart';
import '../../loads/domain/load.dart';
import '../../vehicles/data/vehicles_repository.dart';
import '../../vehicles/domain/vehicle.dart';
import '../data/offers_repository.dart';

/// Taklif yuborish oynasi.
///
/// DIZAYN QARORLARI:
///
///   1. **Transport avtomatik tanlanadi.** Aksariyat haydovchida bitta
///      mashina bor — undan tanlashni so'rash ortiqcha qadam. Bir
///      nechta bo'lsa, yukka mos keladiganlari ko'rsatiladi.
///   2. **Sig'maydigan transport ko'rsatiladi, lekin tanlanmaydi.**
///      Yashirib qo'yish chalkashtiradi: haydovchi "mashinam qani?"
///      deb o'ylaydi. Sabab bilan birga ko'rsatish tushunarliroq.
///   3. **Narx oldindan to'ldirilgan.** E'lon narxi qo'yiladi —
///      haydovchi rozi bo'lsa hech narsa yozmaydi. Bu eng ko'p
///      uchraydigan holat.
///   4. **±30% chegara oldindan aytiladi.** Server rad etishini
///      kutish o'rniga, kiritish paytida ko'rsatamiz.
class SendOfferSheet extends ConsumerStatefulWidget {
  const SendOfferSheet({required this.load, super.key});

  final Load load;

  /// Oynani ochadi. `true` qaytarsa — taklif yuborildi.
  static Future<bool?> show(BuildContext context, Load load) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SendOfferSheet(load: load),
    );
  }

  @override
  ConsumerState<SendOfferSheet> createState() => _SendOfferSheetState();
}

class _SendOfferSheetState extends ConsumerState<SendOfferSheet> {
  final _priceController = TextEditingController();
  final _messageController = TextEditingController();

  String? _vehicleId;
  bool _customPrice = false;
  bool _loading = false;
  String? _error;

  /// Eʼlon narxidan ruxsat etilgan chetlanish — backend bilan bir xil.
  static const _tolerance = 0.3;

  @override
  void initState() {
    super.initState();
    if (widget.load.hasPrice) {
      _priceController.text = formatSoum(
        widget.load.priceTiyin,
        withSuffix: false,
      );
    }
  }

  @override
  void dispose() {
    _priceController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  BigInt? get _offeredTiyin {
    if (!_customPrice && widget.load.hasPrice) return null;
    final tiyin = soumToTiyin(_priceController.text);
    return tiyin > BigInt.zero ? tiyin : null;
  }

  /// Narx chegaradan chiqdimi — kiritish paytida ogohlantiramiz.
  String? get _priceWarning {
    if (!widget.load.hasPrice || widget.load.isNegotiable) return null;

    final offered = _offeredTiyin;
    if (offered == null) return null;

    final listed = parseTiyin(widget.load.priceTiyin);
    if (listed == BigInt.zero) return null;

    final deviation =
        (offered - listed).abs().toDouble() / listed.toDouble();

    if (deviation > _tolerance) {
      return 'Eʼlon narxidan ${(_tolerance * 100).round()}% dan koʻp farq qilmasligi kerak '
          '(${formatSoum(listed)})';
    }
    return null;
  }

  bool get _canSubmit {
    if (_vehicleId == null || _loading) return false;
    if (_priceWarning != null) return false;
    // Narx koʻrsatilmagan eʼlonda haydovchi oʻz narxini berishi shart
    if (!widget.load.hasPrice && _offeredTiyin == null) return false;
    return true;
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(offersRepositoryProvider).send(
            loadId: widget.load.id,
            vehicleId: _vehicleId!,
            offeredPriceTiyin: _offeredTiyin?.toString(),
            message: _messageController.text.trim(),
          );

      if (mounted) Navigator.pop(context, true);
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
    final vehicles = ref.watch(myVehiclesProvider);

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
          ),
          child: Column(
            children: [
              // Tortish uchun belgi
              Container(
                margin: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.gray300,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                  children: [
                    Text('Taklif yuborish', style: theme.textTheme.headlineMedium),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      '${widget.load.pickup.shortLabel} → ${widget.load.delivery.shortLabel}'
                      ' · ${formatWeight(widget.load.weightKg)}',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),

                    Text('Transport', style: theme.textTheme.titleMedium),
                    const SizedBox(height: AppSpacing.md),

                    vehicles.when(
                      loading: () => const Padding(
                        padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                        child: LoadingState(),
                      ),
                      error: (error, _) => ErrorState(
                        error: error,
                        onRetry: () => ref.invalidate(myVehiclesProvider),
                      ),
                      data: (list) => _vehicleList(list),
                    ),

                    const SizedBox(height: AppSpacing.xl),
                    _priceSection(theme),

                    const SizedBox(height: AppSpacing.xl),
                    Text('Xabar (ixtiyoriy)', style: theme.textTheme.titleMedium),
                    const SizedBox(height: AppSpacing.md),
                    TextField(
                      controller: _messageController,
                      maxLines: 3,
                      maxLength: 500,
                      decoration: const InputDecoration(
                        hintText: 'Masalan: 14:00 dan keyin boʻshman',
                      ),
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      _ErrorBox(message: _error!),
                    ],

                    const SizedBox(height: AppSpacing.xxl),
                  ],
                ),
              ),

              // Tugma pastda qotirilgan — roʻyxat uzun boʻlsa ham koʻrinadi
              Container(
                padding: EdgeInsets.only(
                  left: AppSpacing.lg,
                  right: AppSpacing.lg,
                  top: AppSpacing.md,
                  bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpacing.lg,
                ),
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border(top: BorderSide(color: AppColors.border)),
                ),
                child: AppButton(
                  label: 'Taklifni yuborish',
                  isLoading: _loading,
                  onPressed: _canSubmit ? _submit : null,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _vehicleList(List<Vehicle> vehicles) {
    if (vehicles.isEmpty) {
      return const EmptyState(
        icon: Icons.local_shipping_outlined,
        title: 'Transport qoʻshilmagan',
        message: 'Taklif yuborish uchun avval transportingizni qoʻshing va tasdiqlating',
      );
    }

    final usable = vehicles.where((v) => v.canSendOffers && v.fits(widget.load.weightKg));

    // Bitta mos transport boʻlsa — avtomatik tanlaymiz
    if (_vehicleId == null && usable.length == 1) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _vehicleId = usable.first.id);
      });
    }

    return Column(
      children: [
        for (final vehicle in vehicles) ...[
          _VehicleTile(
            vehicle: vehicle,
            weightKg: widget.load.weightKg,
            selected: _vehicleId == vehicle.id,
            onTap: () => setState(() => _vehicleId = vehicle.id),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }

  Widget _priceSection(ThemeData theme) {
    final warning = _priceWarning;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('Narx', style: theme.textTheme.titleMedium),
            const Spacer(),
            if (widget.load.hasPrice)
              TextButton(
                onPressed: () => setState(() {
                  _customPrice = !_customPrice;
                  if (!_customPrice) {
                    _priceController.text =
                        formatSoum(widget.load.priceTiyin, withSuffix: false);
                  }
                }),
                child: Text(_customPrice ? 'Eʼlon narxi' : 'Oʻz narxim'),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),

        if (widget.load.hasPrice && !_customPrice)
          Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: AppColors.primary),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        formatSoum(widget.load.priceTiyin),
                        style: theme.textTheme.titleLarge?.copyWith(
                          color: AppColors.primaryDark,
                        ),
                      ),
                      Text(
                        'Eʼlon narxiga rozisiz',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.primaryDark,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          )
        else
          TextField(
            controller: _priceController,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              _SoumFormatter(),
            ],
            style: theme.textTheme.headlineMedium?.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
            decoration: InputDecoration(
              hintText: '0',
              suffixText: 'soʻm',
              errorText: warning,
            ),
            onChanged: (_) => setState(() {}),
          ),

        if (!widget.load.hasPrice) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Bu eʼlon "kelishuv asosida" — oʻz narxingizni koʻrsating',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ],
    );
  }
}

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({
    required this.vehicle,
    required this.weightKg,
    required this.selected,
    required this.onTap,
  });

  final Vehicle vehicle;
  final int weightKg;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fits = vehicle.fits(weightKg);
    final usable = vehicle.canSendOffers && fits;

    // Sabab aniq aytiladi — "nega tanlay olmayapman?" savoli qolmasin
    final blockedReason = !vehicle.verificationStatus.isVerified
        ? vehicle.verificationStatus.label
        : !vehicle.isActive
            ? 'Faol emas'
            : !fits
                ? 'Quvvat yetarli emas (${formatWeight(vehicle.totalCapacityKg)})'
                : null;

    return Opacity(
      opacity: usable ? 1 : 0.55,
      child: Material(
        color: selected ? AppColors.primaryLight : AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InkWell(
          onTap: usable ? onTap : null,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(
                color: selected ? AppColors.primary : AppColors.border,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.local_shipping_rounded,
                  color: usable ? AppColors.primary : AppColors.gray400,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(vehicle.title, style: theme.textTheme.titleMedium),
                      Text(
                        '${vehicle.plateFormatted} · ${formatWeight(vehicle.totalCapacityKg)}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                      if (blockedReason != null)
                        Text(
                          blockedReason,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.danger,
                          ),
                        ),
                    ],
                  ),
                ),
                if (usable)
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
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
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
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.danger,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Kiritish paytida summani uch xonalab ajratadi.
class _SoumFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final formatted = groupSoumInput(newValue.text);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_states.dart';
import '../../geo/presentation/address_picker_sheet.dart';
import '../../reference/domain/reference_data.dart';
import '../../reference/presentation/reference_providers.dart';
import '../data/loads_repository.dart';
import '../domain/load.dart';
import '../domain/load_draft.dart';
import 'feed_screen.dart' show loadsRepositoryProvider;
import 'widgets/create_load_steps.dart';
import 'package:karvon/core/l10n/formatters.dart';

/// Yuk e'lon qilish.
///
/// NEGA UCH BOSQICH (bitta uzun forma emas): to'liq forma 20 dan ortiq
/// maydondan iborat. Telefon ekranida bunday forma "cheksiz" ko'rinadi
/// va yarim yo'lda tashlab ketiladi — bu bizning asosiy konversiya
/// nuqtamiz, shuning uchun eng katta e'tibor shu yerga qaratiladi.
///
/// Bosqichlar mustaqil tekshiriladi: masalan og'irliksiz keyingi
/// bosqichga o'tib bo'lmaydi. Aks holda foydalanuvchi hamma narsani
/// to'ldirib bo'lgach serverdan xato oladi va qayerga qaytishni
/// bilmaydi.
class CreateLoadScreen extends ConsumerStatefulWidget {
  const CreateLoadScreen({super.key});

  @override
  ConsumerState<CreateLoadScreen> createState() => _CreateLoadScreenState();
}

class _CreateLoadScreenState extends ConsumerState<CreateLoadScreen> {
  final _pageController = PageController();

  LoadDraft _draft = const LoadDraft();
  int _step = 0;
  bool _isSubmitting = false;

  /// Narx tavsiyasi — 3-bosqichga o'tganda bir marta so'raladi.
  PriceEstimate? _estimate;
  bool _isEstimating = false;

  String _stepTitle(BuildContext context) => switch (_step) {
        0 => context.l10n.createStepCargo,
        1 => context.l10n.createStepRoute,
        _ => context.l10n.createStepPrice,
      };

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _update(LoadDraft draft) => setState(() => _draft = draft);

  bool get _canContinue => switch (_step) {
        0 => _draft.isCargoValid,
        1 => _draft.isRouteValid,
        _ => _draft.isComplete,
      };

  Future<void> _next() async {
    if (_step < 2) {
      setState(() => _step++);
      await _pageController.animateToPage(
        _step,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
      // Marshrut ma'lum bo'lgach narx tavsiyasini so'raymiz
      if (_step == 2 && _estimate == null) await _fetchEstimate();
      return;
    }

    await _submit(publishNow: true);
  }

  Future<void> _back() async {
    if (_step == 0) {
      Navigator.pop(context);
      return;
    }
    setState(() => _step--);
    await _pageController.animateToPage(
      _step,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  /// Tavsiya narx.
  ///
  /// Yuk beruvchi bozor narxini bilmasligi mumkin. Juda past narx
  /// qo'yilsa e'lon javobsiz qoladi va odam platformadan ketadi —
  /// shuning uchun tavsiya ko'rsatiladi, lekin MAJBURLANMAYDI.
  Future<void> _fetchEstimate() async {
    final pickup = _draft.pickup;
    final delivery = _draft.delivery;
    final weight = _draft.weightKg;
    if (pickup == null || delivery == null || weight == null) return;

    setState(() => _isEstimating = true);

    try {
      final estimate = await ref.read(loadsRepositoryProvider).estimate(
            fromLat: pickup.lat,
            fromLng: pickup.lng,
            toLat: delivery.lat,
            toLng: delivery.lng,
            weightKg: weight,
          );
      if (!mounted) return;
      setState(() {
        _estimate = estimate;
        _isEstimating = false;
      });
    } on ApiException {
      // Tavsiya bo'lmasa ham e'lon berish mumkin — bu to'suvchi xato emas
      if (!mounted) return;
      setState(() => _isEstimating = false);
    }
  }

  Future<void> _submit({required bool publishNow}) async {
    if (!_draft.isComplete || _isSubmitting) return;

    setState(() => _isSubmitting = true);

    try {
      final load = await ref
          .read(loadsRepositoryProvider)
          .create(_draft.toCreateBody(publishNow: publishNow));

      if (!mounted) return;
      Navigator.pop(context, load);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            publishNow ? context.l10n.loadPublished : context.l10n.draftSaved,
          ),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      _showError(error);
    }
  }

  /// Server xatosini to'g'ri bosqichga qaytarib ko'rsatamiz.
  ///
  /// "Nimadir xato" degan xabar foydalanuvchini boshi berk ko'chaga
  /// olib kiradi: u qaysi maydonni tuzatishni bilmaydi.
  void _showError(ApiException error) {
    final backTo = switch (error.code) {
      'LOAD_PICKUP_TIME_PASSED' || 'LOAD_TIME_WINDOW_INVALID' => 1,
      'GEO_POINT_OUTSIDE_UZBEKISTAN' || 'GEO_POINTS_TOO_CLOSE' => 1,
      _ => null,
    };

    if (backTo != null && backTo != _step) {
      setState(() => _step = backTo);
      _pageController.jumpToPage(backTo);
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(localizeError(context, error)),
        backgroundColor: AppColors.danger,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final reference = ref.watch(referenceProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(_stepTitle(context)),
        leading: IconButton(
          icon: Icon(_step == 0 ? Icons.close_rounded : Icons.arrow_back_rounded),
          onPressed: _isSubmitting ? null : _back,
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(
            value: (_step + 1) / 3,
            minHeight: 4,
            backgroundColor: AppColors.gray100,
          ),
        ),
      ),
      body: reference.when(
        loading: () => LoadingState(message: context.l10n.loadingReference),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(referenceProvider),
        ),
        data: (bundle) => Column(
          children: [
            Expanded(
              child: PageView(
                controller: _pageController,
                // Sahifalar faqat tugma orqali almashadi: surish bilan
                // to'ldirilmagan bosqichga o'tib ketish mumkin bo'lmasin
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  CargoStep(draft: _draft, bundle: bundle, onChanged: _update),
                  RouteStep(
                    draft: _draft,
                    onChanged: _update,
                    onPickAddress: _pickAddress,
                  ),
                  PriceStep(
                    draft: _draft,
                    bundle: bundle,
                    estimate: _estimate,
                    isEstimating: _isEstimating,
                    onChanged: _update,
                  ),
                ],
              ),
            ),
            _bottomBar(bundle),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar(ReferenceBundle bundle) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Oxirgi bosqichda summa yana bir marta ko'rinadi: odam
            // "e'lon qilish" ni bosishdan oldin nimaga rozi bo'layotganini
            // ko'rishi kerak
            if (_step == 2) ...[
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _draft.priceTiyin == null
                          ? context.l10n.priceNegotiable
                          : context.soum(_draft.priceTiyin),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (_draft.weightKg != null)
                    Text(
                      context.weight(_draft.weightKg!),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: AppColors.textSecondary,
                          ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            Row(
              children: [
                if (_step == 2)
                  Expanded(
                    child: AppButton.secondary(
                      label: context.l10n.actionSaveDraft,
                      onPressed: _isSubmitting
                          ? null
                          : () => _submit(publishNow: false),
                    ),
                  ),
                if (_step == 2) const SizedBox(width: AppSpacing.md),
                Expanded(
                  flex: 2,
                  child: AppButton(
                    label: _step == 2 ? context.l10n.actionPublish : context.l10n.actionContinue,
                    isLoading: _isSubmitting,
                    onPressed: _canContinue ? _next : null,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Manzil tanlash oynasini ochadi va qoralamaga yozadi.
  Future<void> _pickAddress({required bool isPickup}) async {
    final place = await showAddressPicker(
      context,
      title: isPickup ? context.l10n.pickupAddressTitle : context.l10n.deliveryAddressTitle,
      initialQuery: isPickup ? _draft.pickup?.label : _draft.delivery?.label,
    );

    if (place == null || !mounted) return;

    _update(
      isPickup
          ? _draft.copyWith(pickup: place)
          : _draft.copyWith(delivery: place),
    );

    // Manzil o'zgardi — eski narx tavsiyasi endi to'g'ri emas
    setState(() => _estimate = null);
  }
}

/// Yaratilgan yuk `Navigator.pop` orqali qaytadi — chaqiruvchi ekran
/// ro'yxatni yangilashi uchun.
typedef CreatedLoad = Load;

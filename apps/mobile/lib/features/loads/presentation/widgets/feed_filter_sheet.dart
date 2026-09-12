import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:karvon/core/l10n/formatters.dart';
import 'package:karvon/l10n/app_localizations.dart';

import '../../../../core/location/device_location.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/form_fields.dart';
import '../../../reference/domain/reference_data.dart';
import '../../../reference/presentation/reference_providers.dart';
import '../../data/loads_repository.dart';

/// Lenta filtri.
///
/// NEGA "KO'RSATISH" TUGMASI (har bir bosishda yangilash emas):
/// haydovchi filtrni kam o'zgartiradi, lekin o'zgartirganda bir nechta
/// maydonni birga (yo'nalish + og'irlik). Har bir bosishda lentani
/// qayta so'rash mobil internetda sekin va ro'yxat sakrab turadi —
/// natija bir marta, oxirida so'raladi.
///
/// Natija: yangi filtr yoki `null` (oyna yopildi — hech narsa o'zgarmadi).
Future<LoadFilter?> showFeedFilterSheet(BuildContext context, LoadFilter current) {
  return showModalBottomSheet<LoadFilter>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    ),
    builder: (_) => FeedFilterSheet(initial: current),
  );
}

/// Saralash turlari — backend `LoadFeedQueryDto.sort` bilan mos.
///
/// `price_asc` ataylab yo'q: haydovchiga "avval eng arzon yuk" kerak emas.
const _sorts = ['match_score', 'created_at', 'price_desc', 'pickup_date', 'distance_asc'];

String _sortLabel(AppLocalizations l10n, String sort) => switch (sort) {
      'match_score' => l10n.sortBestMatch,
      'created_at' => l10n.sortNewest,
      'price_desc' => l10n.sortPriceHigh,
      'pickup_date' => l10n.sortPickupSoon,
      'distance_asc' => l10n.sortNearest,
      _ => sort,
    };

class FeedFilterSheet extends ConsumerStatefulWidget {
  const FeedFilterSheet({required this.initial, super.key});

  final LoadFilter initial;

  @override
  ConsumerState<FeedFilterSheet> createState() => _FeedFilterSheetState();
}

class _FeedFilterSheetState extends ConsumerState<FeedFilterSheet> {
  late String _sort = widget.initial.sort;
  late int? _fromRegionId = widget.initial.fromRegionId;
  late int? _toRegionId = widget.initial.toRegionId;
  late final Set<int> _vehicleTypeIds = {...widget.initial.vehicleTypeIds};
  late double? _lat = widget.initial.lat;
  late double? _lng = widget.initial.lng;

  late final _minWeight = TextEditingController(text: widget.initial.minWeightKg?.toString() ?? '');
  late final _maxWeight = TextEditingController(text: widget.initial.maxWeightKg?.toString() ?? '');
  late final _minPrice = TextEditingController(text: _soumText(widget.initial.minPriceTiyin));

  bool _isLocating = false;

  /// "Menga yaqin" nega tanlanmadi. Oyna ichida ko'rsatiladi: snackbar
  /// oyna ortida qolib ko'rinmasdi.
  String? _notice;

  static String _soumText(String? tiyin) {
    if (tiyin == null) return '';
    return groupSoumInput((parseTiyin(tiyin) ~/ BigInt.from(tiyinPerSoum)).toString());
  }

  @override
  void dispose() {
    _minWeight.dispose();
    _maxWeight.dispose();
    _minPrice.dispose();
    super.dispose();
  }

  static int? _kg(TextEditingController controller) =>
      int.tryParse(controller.text.replaceAll(RegExp(r'[^\d]'), ''));

  /// Eng kami eng ko'pidan katta — server bo'sh ro'yxat qaytarardi va
  /// haydovchi "yuk yo'q" deb o'ylardi. Xato oldindan aytiladi.
  bool get _weightInvalid {
    final min = _kg(_minWeight);
    final max = _kg(_maxWeight);
    return min != null && max != null && min > max;
  }

  LoadFilter _result() {
    final price = soumToTiyin(_minPrice.text);
    return LoadFilter(
      fromRegionId: _fromRegionId,
      toRegionId: _toRegionId,
      minWeightKg: _kg(_minWeight),
      maxWeightKg: _kg(_maxWeight),
      vehicleTypeIds: _vehicleTypeIds.toList()..sort(),
      // Bu oynada ko'rsatilmaydigan qiymatlar o'zgarishsiz o'tadi
      bodyTypeIds: widget.initial.bodyTypeIds,
      maxDistanceKm: widget.initial.maxDistanceKm,
      minPriceTiyin: price == BigInt.zero ? null : price.toString(),
      lat: _lat,
      lng: _lng,
      sort: _sort,
    );
  }

  /// Yaqinlik bo'yicha saralash nuqtasiz ma'nosiz: joylashuv bo'lmasa
  /// saralash o'zgarmaydi va nima qilish kerakligi aytiladi.
  Future<void> _selectSort(String sort) async {
    setState(() => _notice = null);

    if (sort == 'distance_asc' && (_lat == null || _lng == null)) {
      setState(() => _isLocating = true);
      final position = await ref.read(locationResolverProvider)();
      if (!mounted) return;

      if (position == null) {
        setState(() {
          _isLocating = false;
          _notice = context.l10n.filterNearNeedsLocation;
        });
        return;
      }
      _lat = position.lat;
      _lng = position.lng;
      _isLocating = false;
    }

    setState(() => _sort = sort);
  }

  void _reset() {
    setState(() {
      _sort = 'match_score';
      _fromRegionId = null;
      _toRegionId = null;
      _vehicleTypeIds.clear();
      _minWeight.clear();
      _maxWeight.clear();
      _minPrice.clear();
      _notice = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final bundle = ref.watch(referenceProvider).valueOrNull;

    return Padding(
      // Klaviatura ochilganda pastki tugma yopilib qolmasin
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.sm, 0),
              child: Row(
                children: [
                  Expanded(child: Text(l10n.filterTitle, style: theme.textTheme.titleMedium)),
                  TextButton(onPressed: _reset, child: Text(l10n.actionClear)),
                ],
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.lg),
                children: [
                  _Section(
                    title: l10n.filterSort,
                    notice: _notice,
                    child: Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: [
                        for (final sort in _sorts)
                          ChoiceChip(
                            label: Text(_sortLabel(l10n, sort)),
                            selected: _sort == sort,
                            onSelected: _isLocating ? null : (_) => _selectSort(sort),
                          ),
                      ],
                    ),
                  ),
                  _Section(
                    title: l10n.fieldFrom,
                    child: _regionChips(bundle, _fromRegionId, (id) => setState(() => _fromRegionId = id)),
                  ),
                  _Section(
                    title: l10n.fieldTo,
                    child: _regionChips(bundle, _toRegionId, (id) => setState(() => _toRegionId = id)),
                  ),
                  _Section(
                    title: l10n.filterWeight,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: AppTextField(
                            label: l10n.filterMin,
                            controller: _minWeight,
                            hint: '1000',
                            keyboardType: TextInputType.number,
                            inputFormatters: const [IntegerInputFormatter(max: 60000)],
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: AppTextField(
                            label: l10n.filterMax,
                            controller: _maxWeight,
                            hint: '20000',
                            keyboardType: TextInputType.number,
                            inputFormatters: const [IntegerInputFormatter(max: 60000)],
                            errorText: _weightInvalid ? l10n.filterWeightInvalid : null,
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (bundle != null && bundle.vehicleTypes.isNotEmpty)
                    _Section(
                      title: l10n.fieldVehicleType,
                      child: Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.sm,
                        children: [
                          for (final type in bundle.vehicleTypes)
                            FilterChip(
                              label: Text(type.name.of(context.language)),
                              selected: _vehicleTypeIds.contains(type.id),
                              onSelected: (on) => setState(
                                () => on ? _vehicleTypeIds.add(type.id) : _vehicleTypeIds.remove(type.id),
                              ),
                            ),
                        ],
                      ),
                    ),
                  AppTextField(
                    label: l10n.filterMinPrice,
                    controller: _minPrice,
                    hint: '1 000 000',
                    suffix: l10n.unitSoum,
                    keyboardType: TextInputType.number,
                    inputFormatters: const [SoumInputFormatter()],
                    onChanged: (_) => setState(() {}),
                  ),
                ],
              ),
            ),
            // Tugma ro'yxatdan tashqarida — uzun filtrda ham doim ko'rinadi
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: SafeArea(
                top: false,
                child: AppButton(
                  label: l10n.actionShowResults,
                  onPressed: _weightInvalid ? null : () => Navigator.pop(context, _result()),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Viloyat tanlovi: "Istalgan" + spravochnikdagi viloyatlar joriy tilda.
  Widget _regionChips(ReferenceBundle? bundle, int? selected, ValueChanged<int?> onChanged) {
    if (bundle == null) {
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.md),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
      );
    }

    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        ChoiceChip(
          label: Text(context.l10n.filterAnyRegion),
          selected: selected == null,
          onSelected: (_) => onChanged(null),
        ),
        for (final region in bundle.regions)
          ChoiceChip(
            label: Text(region.name.of(context.language)),
            selected: selected == region.id,
            onSelected: (_) => onChanged(region.id),
          ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.notice});

  final String title;
  final Widget child;
  final String? notice;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.textTheme.labelLarge?.copyWith(color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          child,
          if (notice != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(notice!, style: theme.textTheme.bodySmall?.copyWith(color: AppColors.danger)),
          ],
        ],
      ),
    );
  }
}

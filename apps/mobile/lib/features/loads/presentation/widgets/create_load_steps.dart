import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../shared/widgets/form_fields.dart';
import '../../../reference/domain/reference_data.dart';
import '../../data/loads_repository.dart';
import '../../domain/load_draft.dart';

const _stepPadding = EdgeInsets.all(AppSpacing.lg);

/// Bosqichlar orasida umumiy oraliq.
const _gap = SizedBox(height: AppSpacing.lg);

/// Qadoq turlari — backend `@IsIn` bilan cheklaydi, ro'yxat aynan mos.
const _packageTypes = ['palet', 'qop', 'quti', 'bochka', 'rulon', 'boshqa'];

/// To'lov usullari.
///
/// ESCROW alohida tushuntiriladi: bu bizning asosiy himoya vositamiz,
/// lekin nomi foydalanuvchiga hech narsa demaydi.
const _paymentMethods = <String, ({String label, String hint})>{
  'CASH': (label: 'Naqd', hint: 'Yetkazilgach haydovchiga naqd toʻlanadi'),
  'CARD': (label: 'Karta', hint: 'Haydovchining kartasiga oʻtkazma'),
  'BANK_TRANSFER': (label: 'Bank', hint: 'Yuridik shaxslar uchun pul koʻchirish'),
  'ESCROW': (
    label: 'Himoyalangan',
    hint: 'Pul KARVON hisobida turadi va yuk yetkazilgach chiqariladi',
  ),
};

// =====================================================================
//  1-bosqich — yuk
// =====================================================================

class CargoStep extends StatelessWidget {
  const CargoStep({
    required this.draft,
    required this.bundle,
    required this.onChanged,
    super.key,
  });

  final LoadDraft draft;
  final ReferenceBundle bundle;
  final ValueChanged<LoadDraft> onChanged;

  @override
  Widget build(BuildContext context) {
    final category = draft.categoryId == null
        ? null
        : bundle.categoryById(draft.categoryId!);

    return ListView(
      padding: _stepPadding,
      children: [
        SectionCard(
          title: 'Yuk haqida',
          subtitle: 'Haydovchi eʼlonni shu maʼlumotlar boʻyicha tanlaydi',
          children: [
            AppTextField(
              label: 'Nomi',
              isRequired: true,
              hint: 'Masalan: Mebel — 5 ta shkaf',
              maxLength: 160,
              onChanged: (value) => onChanged(draft.copyWith(title: value)),
            ),
            ChipsField<CargoCategory>(
              label: 'Kategoriya',
              options: bundle.cargoCategories,
              selected: draft.categoryId == null ? const [] : [draft.categoryId!],
              multiple: false,
              labelOf: (item) => item.name.uz,
              idOf: (item) => item.id,
              onChanged: (ids) => onChanged(
                draft.copyWith(categoryId: ids.isEmpty ? null : ids.first),
              ),
            ),
            if (category?.requiresSpecialPermit ?? false) ...[
              const _Notice(
                icon: Icons.gavel_rounded,
                text: 'Bu kategoriya uchun maxsus ruxsatnoma talab qilinadi. '
                    'Hujjatsiz yuk yoʻlda toʻxtatilishi mumkin.',
                color: AppColors.warning,
              ),
              _gap,
            ],
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: AppTextField(
                    label: 'Ogʻirlik',
                    isRequired: true,
                    hint: '4000',
                    suffix: 'kg',
                    keyboardType: TextInputType.number,
                    inputFormatters: const [IntegerInputFormatter(max: 60000)],
                    onChanged: (value) => onChanged(
                      draft.copyWith(weightKg: int.tryParse(value)),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: AppTextField(
                    label: 'Hajm',
                    hint: '18',
                    suffix: 'm³',
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[\d.,]')),
                    ],
                    onChanged: (value) {
                      final normalized = value.replaceAll(',', '.');
                      onChanged(
                        normalized.isEmpty
                            ? draft.copyWith(clearVolume: true)
                            : draft.copyWith(volumeM3: double.tryParse(normalized)),
                      );
                    },
                  ),
                ),
              ],
            ),
            if (draft.weightKg != null) _VehicleHint(bundle: bundle, weightKg: draft.weightKg!),
          ],
        ),
        _gap,
        SectionCard(
          title: 'Qadoq',
          subtitle: 'Ixtiyoriy — lekin haydovchi yuklashga tayyorgarlik koʻradi',
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: AppTextField(
                    label: 'Soni',
                    hint: '5',
                    keyboardType: TextInputType.number,
                    inputFormatters: const [IntegerInputFormatter(max: 100000)],
                    onChanged: (value) => onChanged(
                      value.isEmpty
                          ? draft.copyWith(clearPackages: true)
                          : draft.copyWith(packagesCount: int.tryParse(value)),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  flex: 2,
                  child: _PackageTypeField(
                    value: draft.packageType,
                    onChanged: (value) =>
                        onChanged(draft.copyWith(packageType: value)),
                  ),
                ),
              ],
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              value: draft.isFragile,
              onChanged: (value) => onChanged(draft.copyWith(isFragile: value)),
              title: const Text('Moʻrt yuk'),
              subtitle: const Text('Shisha, keramika, texnika — ehtiyot boʻlib tashiladi'),
            ),
          ],
        ),
        _gap,
        SectionCard(
          title: 'Qoʻshimcha izoh',
          children: [
            AppTextField(
              label: 'Izoh',
              hint: 'Yuklash sharoiti, kirish yoʻli, maxsus talablar…',
              maxLines: 4,
              maxLength: 2000,
              onChanged: (value) => onChanged(draft.copyWith(description: value)),
            ),
          ],
        ),
      ],
    );
  }
}

/// Og'irlikka mos transport turini eslatadi.
///
/// Foydalanuvchi 15 tonnalik yukni "Damas" bilan tashimoqchi bo'lishi
/// mumkin — buni oldindan aytish e'lonni javobsiz qolishidan saqlaydi.
class _VehicleHint extends StatelessWidget {
  const _VehicleHint({required this.bundle, required this.weightKg});

  final ReferenceBundle bundle;
  final int weightKg;

  @override
  Widget build(BuildContext context) {
    final suitable = bundle.vehicleTypesFor(weightKg);

    if (suitable.isEmpty) {
      return const _Notice(
        icon: Icons.error_outline_rounded,
        text: 'Bu ogʻirlik uchun mos transport topilmadi. Yukni boʻlib '
            'yuborish kerak boʻlishi mumkin.',
        color: AppColors.danger,
      );
    }

    return _Notice(
      icon: Icons.local_shipping_outlined,
      text: 'Mos transport: ${suitable.take(3).map((type) => type.name.uz).join(', ')}'
          '${suitable.length > 3 ? ' va boshqalar' : ''}',
      color: AppColors.info,
    );
  }
}

class _PackageTypeField extends StatelessWidget {
  const _PackageTypeField({required this.value, required this.onChanged});

  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return AppSelectField(
      label: 'Turi',
      value: value,
      onTap: () async {
        final selected = await showModalBottomSheet<String>(
          context: context,
          builder: (context) => SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final type in _packageTypes)
                  ListTile(
                    title: Text(type),
                    trailing: type == value
                        ? const Icon(Icons.check_rounded, color: AppColors.primary)
                        : null,
                    onTap: () => Navigator.pop(context, type),
                  ),
              ],
            ),
          ),
        );
        if (selected != null) onChanged(selected);
      },
    );
  }
}

// =====================================================================
//  2-bosqich — manzil va vaqt
// =====================================================================

class RouteStep extends StatelessWidget {
  const RouteStep({
    required this.draft,
    required this.onChanged,
    required this.onPickAddress,
    super.key,
  });

  final LoadDraft draft;
  final ValueChanged<LoadDraft> onChanged;
  final Future<void> Function({required bool isPickup}) onPickAddress;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: _stepPadding,
      children: [
        SectionCard(
          title: 'Yuk olish',
          children: [
            AppSelectField(
              label: 'Manzil',
              isRequired: true,
              icon: Icons.trip_origin_rounded,
              value: draft.pickup?.label,
              placeholder: 'Manzilni qidiring',
              onTap: () => onPickAddress(isPickup: true),
            ),
            AppTextField(
              label: 'Kontakt ismi',
              hint: 'Anvar aka',
              onChanged: (value) =>
                  onChanged(draft.copyWith(pickupContactName: value)),
            ),
            _PhoneField(
              label: 'Kontakt telefoni',
              helper: 'Haydovchi yuk olish nuqtasiga yetganda koʻrinadi',
              onChanged: (value) =>
                  onChanged(draft.copyWith(pickupContactPhone: value)),
            ),
          ],
        ),
        _gap,
        SectionCard(
          title: 'Yetkazish',
          children: [
            AppSelectField(
              label: 'Manzil',
              isRequired: true,
              icon: Icons.place_rounded,
              value: draft.delivery?.label,
              placeholder: 'Manzilni qidiring',
              onTap: () => onPickAddress(isPickup: false),
            ),
            AppTextField(
              label: 'Kontakt ismi',
              hint: 'Qabul qiluvchi',
              onChanged: (value) =>
                  onChanged(draft.copyWith(deliveryContactName: value)),
            ),
            _PhoneField(
              label: 'Kontakt telefoni',
              onChanged: (value) =>
                  onChanged(draft.copyWith(deliveryContactPhone: value)),
            ),
          ],
        ),
        _gap,
        SectionCard(
          title: 'Vaqt',
          subtitle: 'Yuklash oynasi — haydovchi shu oraliqda keladi',
          children: [
            _DateTimeField(
              label: 'Yuklash — dan',
              isRequired: true,
              value: draft.pickupFrom,
              onChanged: (value) {
                // Boshlanish tugashdan keyinga surilsa, tugashni ham suramiz:
                // aks holda foydalanuvchi xato holatda qolib ketadi
                final end = draft.pickupTo;
                onChanged(
                  draft.copyWith(
                    pickupFrom: value,
                    pickupTo: end != null && end.isBefore(value)
                        ? value.add(const Duration(hours: 4))
                        : end,
                  ),
                );
              },
            ),
            _DateTimeField(
              label: 'Yuklash — gacha',
              isRequired: true,
              value: draft.pickupTo,
              firstDate: draft.pickupFrom,
              onChanged: (value) => onChanged(draft.copyWith(pickupTo: value)),
            ),
            _DateTimeField(
              label: 'Yetkazish muddati',
              value: draft.deliveryBy,
              firstDate: draft.pickupFrom,
              helper: 'Ixtiyoriy — belgilansa haydovchi rejani shunga qaradi',
              onChanged: (value) => onChanged(draft.copyWith(deliveryBy: value)),
              onClear: () => onChanged(draft.copyWith(clearDeliveryBy: true)),
            ),
          ],
        ),
      ],
    );
  }
}

class _PhoneField extends StatelessWidget {
  const _PhoneField({required this.label, required this.onChanged, this.helper});

  final String label;
  final String? helper;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return AppTextField(
      label: label,
      hint: '90 123 45 67',
      helper: helper,
      keyboardType: TextInputType.phone,
      textCapitalization: TextCapitalization.none,
      inputFormatters: [
        FilteringTextInputFormatter.digitsOnly,
        LengthLimitingTextInputFormatter(9),
        const UzPhoneInputFormatter(),
      ],
      // Serverga E.164 ketadi; maskadagi probellar tashlanadi
      onChanged: (value) {
        final digits = value.replaceAll(RegExp(r'[^\d]'), '');
        onChanged(digits.isEmpty ? '' : '+998$digits');
      },
    );
  }
}

/// Sana va vaqtni ketma-ket so'raydigan maydon.
class _DateTimeField extends StatelessWidget {
  const _DateTimeField({
    required this.label,
    required this.value,
    required this.onChanged,
    this.firstDate,
    this.helper,
    this.isRequired = false,
    this.onClear,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onChanged;
  final DateTime? firstDate;
  final String? helper;
  final bool isRequired;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        AppSelectField(
          label: label,
          isRequired: isRequired,
          icon: Icons.schedule_rounded,
          helper: helper,
          value: value == null ? null : _format(value!),
          placeholder: 'Sana va vaqt',
          onTap: () => _pick(context),
        ),
        if (value != null && onClear != null)
          Positioned(
            right: 40,
            top: 26,
            child: IconButton(
              icon: const Icon(Icons.clear_rounded, size: AppSizes.iconSm),
              onPressed: onClear,
              tooltip: 'Tozalash',
            ),
          ),
      ],
    );
  }

  Future<void> _pick(BuildContext context) async {
    final now = DateTime.now();
    // O'tgan vaqtni tanlashga yo'l qo'ymaymiz: server ham rad etadi
    final earliest = firstDate ?? now;
    final initial = value ?? earliest.add(const Duration(hours: 2));

    final date = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(earliest) ? earliest : initial,
      firstDate: DateTime(earliest.year, earliest.month, earliest.day),
      // 90 kundan uzoq rejalashtirish amalda uchramaydi
      lastDate: now.add(const Duration(days: 90)),
    );
    if (date == null || !context.mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null) return;

    onChanged(DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  static String _format(DateTime value) {
    const months = [
      'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
      'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
    ];

    final hh = value.hour.toString().padLeft(2, '0');
    final mm = value.minute.toString().padLeft(2, '0');
    return '${value.day} ${months[value.month - 1]}, $hh:$mm';
  }
}

// =====================================================================
//  3-bosqich — narx va talablar
// =====================================================================

class PriceStep extends StatefulWidget {
  const PriceStep({
    required this.draft,
    required this.bundle,
    required this.estimate,
    required this.isEstimating,
    required this.onChanged,
    super.key,
  });

  final LoadDraft draft;
  final ReferenceBundle bundle;
  final PriceEstimate? estimate;
  final bool isEstimating;
  final ValueChanged<LoadDraft> onChanged;

  @override
  State<PriceStep> createState() => _PriceStepState();
}

class _PriceStepState extends State<PriceStep> {
  final _priceController = TextEditingController();

  @override
  void dispose() {
    _priceController.dispose();
    super.dispose();
  }

  /// Tavsiya narxni maydonga qo'yadi — foydalanuvchi qo'lda yozmasin.
  void _applySuggested(String tiyin) {
    final soum = parseTiyin(tiyin) ~/ BigInt.from(tiyinPerSoum);
    _priceController.text = groupSoumInput(soum.toString());
    widget.onChanged(widget.draft.copyWith(priceTiyin: parseTiyin(tiyin)));
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.draft;
    final bundle = widget.bundle;

    // Harorat maydonlari faqat harorat nazorati bor kuzov tanlanganda
    final needsTemperature = draft.bodyTypeIds.any(
      (id) => bundle.bodyTypeById(id)?.isTemperatureControlled ?? false,
    );

    return ListView(
      padding: _stepPadding,
      children: [
        if (widget.isEstimating)
          const SectionCard(
            title: 'Narx tavsiyasi',
            children: [
              SizedBox(
                height: 40,
                child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
              ),
            ],
          )
        else if (widget.estimate != null)
          _EstimateCard(
            estimate: widget.estimate!,
            onApply: _applySuggested,
          ),
        _gap,
        SectionCard(
          title: 'Narx',
          subtitle: 'Boʻsh qoldirsangiz — "kelishuv asosida" deb eʼlon qilinadi',
          children: [
            AppTextField(
              label: 'Taklif qilingan narx',
              controller: _priceController,
              hint: '2 400 000',
              suffix: 'soʻm',
              keyboardType: TextInputType.number,
              inputFormatters: const [SoumInputFormatter()],
              onChanged: (value) {
                final tiyin = soumToTiyin(value);
                widget.onChanged(
                  tiyin == BigInt.zero
                      ? draft.copyWith(clearPrice: true)
                      : draft.copyWith(priceTiyin: tiyin),
                );
              },
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              // Narxsiz eʼlon faqat kelishuv asosida boʻla oladi —
              // yoqilgan holda turadi va oʻchirib boʻlmaydi
              value: draft.isNegotiableEffective,
              onChanged: draft.priceTiyin == null
                  ? null
                  : (value) => widget.onChanged(draft.copyWith(isNegotiable: value)),
              title: const Text('Kelishish mumkin'),
              subtitle: Text(
                draft.priceTiyin == null
                    ? 'Narx koʻrsatilmagan — eʼlon kelishuv asosida chiqadi'
                    : 'Haydovchilar oʻz narxini taklif qila oladi',
              ),
            ),
          ],
        ),
        _gap,
        SectionCard(
          title: 'Toʻlov usuli',
          children: [
            // `RadioGroup` — Flutter 3.32 dan keyingi API: tanlov qiymati
            // va o'zgarish ishlovchisi bir joyda, har bir tugmada emas
            RadioGroup<String>(
              groupValue: draft.paymentMethod,
              onChanged: (value) => widget.onChanged(
                draft.copyWith(paymentMethod: value ?? 'CASH'),
              ),
              child: Column(
                children: [
                  for (final entry in _paymentMethods.entries)
                    RadioListTile<String>(
                      contentPadding: EdgeInsets.zero,
                      value: entry.key,
                      title: Text(entry.value.label),
                      subtitle: Text(entry.value.hint),
                    ),
                ],
              ),
            ),
          ],
        ),
        _gap,
        SectionCard(
          title: 'Transport talablari',
          subtitle: 'Boʻsh qoldirsangiz — har qanday mos transport',
          children: [
            ChipsField<VehicleType>(
              label: 'Transport turi',
              options: draft.weightKg == null
                  ? bundle.vehicleTypes
                  : bundle.vehicleTypesFor(draft.weightKg!),
              selected: draft.vehicleTypeIds,
              labelOf: (item) => '${item.name.uz} · ${item.capacityLabel}',
              idOf: (item) => item.id,
              onChanged: (ids) =>
                  widget.onChanged(draft.copyWith(vehicleTypeIds: ids)),
            ),
            ChipsField<BodyType>(
              label: 'Kuzov turi',
              options: bundle.bodyTypes,
              selected: draft.bodyTypeIds,
              labelOf: (item) => item.name.uz,
              idOf: (item) => item.id,
              onChanged: (ids) => widget.onChanged(
                // Harorat nazorati bor kuzov olib tashlansa, harorat
                // qiymatlari ham ketishi kerak — aks holda ular jimgina
                // saqlanib qoladi va e'londa g'alati ko'rinadi
                ids.any((id) => bundle.bodyTypeById(id)?.isTemperatureControlled ?? false)
                    ? draft.copyWith(bodyTypeIds: ids)
                    : draft.copyWith(bodyTypeIds: ids, clearTemperature: true),
              ),
            ),
            if (needsTemperature)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: AppTextField(
                      label: 'Harorat — dan',
                      hint: '2',
                      suffix: '°C',
                      keyboardType: const TextInputType.numberWithOptions(signed: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[\d-]')),
                      ],
                      onChanged: (value) => widget.onChanged(
                        draft.copyWith(tempMinC: int.tryParse(value)),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: AppTextField(
                      label: 'gacha',
                      hint: '8',
                      suffix: '°C',
                      keyboardType: const TextInputType.numberWithOptions(signed: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[\d-]')),
                      ],
                      onChanged: (value) => widget.onChanged(
                        draft.copyWith(tempMaxC: int.tryParse(value)),
                      ),
                    ),
                  ),
                ],
              ),
            ChipsField<SpecialRequirement>(
              label: 'Maxsus talablar',
              helper: 'Qoʻshimcha xizmat narxni oshiradi',
              options: bundle.specialRequirements,
              selected: draft.specialRequirementIds,
              labelOf: (item) => item.name.uz,
              idOf: (item) => item.id,
              onChanged: (ids) =>
                  widget.onChanged(draft.copyWith(specialRequirementIds: ids)),
            ),
          ],
        ),
      ],
    );
  }
}

/// Tavsiya narx kartochkasi.
class _EstimateCard extends StatelessWidget {
  const _EstimateCard({required this.estimate, required this.onApply});

  final PriceEstimate estimate;
  final ValueChanged<String> onApply;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.primaryLight,
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.insights_rounded, color: AppColors.primary),
              const SizedBox(width: AppSpacing.sm),
              Text('Tavsiya narx', style: theme.textTheme.titleSmall),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            formatSoum(estimate.suggestedPriceTiyin),
            style: theme.textTheme.headlineSmall?.copyWith(color: AppColors.primary),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '${formatSoumShort(estimate.minPriceTiyin)} — '
            '${formatSoumShort(estimate.maxPriceTiyin)} oraligʻida',
            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              const Icon(Icons.route_rounded, size: AppSizes.iconSm, color: AppColors.gray400),
              const SizedBox(width: AppSpacing.xs),
              Text(
                '${formatDistance(estimate.distanceKm)} · '
                '${formatDuration(estimate.durationMin)}',
                style: theme.textTheme.bodySmall,
              ),
            ],
          ),
          if (!estimate.isRealRoute) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Masofa taxminiy hisoblangan — haqiqiy yoʻl biroz uzunroq boʻlishi mumkin',
              style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => onApply(estimate.suggestedPriceTiyin),
              child: const Text('Shu narxni qoʻyish'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Kichik ogohlantirish qatori.
class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text, required this.color});

  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: AppSizes.iconSm, color: color),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:karvon/core/l10n/formatters.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_states.dart';
import '../../reference/presentation/reference_providers.dart';
import '../../vehicles/data/vehicles_repository.dart';
import '../../vehicles/domain/vehicle.dart';
import '../domain/driver_readiness.dart';
import 'profile_providers.dart';
import 'widgets/readiness_card.dart';
import '../../reference/domain/reference_data.dart';
import '../../vehicles/presentation/vehicle_l10n.dart';
import 'profile_l10n.dart';

/// Haydovchi profili: tayyorlik, transport va yo'nalishlar.
///
/// UCHALASI BIR EKRANDA: ular bir maqsadga xizmat qiladi — taklif
/// yubora olish. Alohida ekranlarga bo'linsa foydalanuvchi "nima
/// yetishmayapti" savoliga javob topish uchun uch joyga kirishi
/// kerak bo'lardi.
class DriverProfileScreen extends ConsumerStatefulWidget {
  const DriverProfileScreen({super.key});

  @override
  ConsumerState<DriverProfileScreen> createState() => _DriverProfileScreenState();
}

class _DriverProfileScreenState extends ConsumerState<DriverProfileScreen> {
  bool _isSubmitting = false;

  Future<void> _submitVerification() async {
    setState(() => _isSubmitting = true);

    try {
      await ref.read(profileRepositoryProvider).submitVerification();
      if (!mounted) return;

      ref.invalidate(driverReadinessProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.verificationSubmitted)),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
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

  @override
  Widget build(BuildContext context) {
    final readiness = ref.watch(driverReadinessProvider);

    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.driverProfileTitle)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(driverReadinessProvider);
          ref.invalidate(driverRoutesProvider);
          ref.invalidate(myVehiclesProvider);
        },
        child: readiness.when(
          loading: () => const LoadingState(),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
              ErrorState(
                error: error,
                onRetry: () => ref.invalidate(driverReadinessProvider),
              ),
            ],
          ),
          data: (data) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              if (data != null) ...[
                ReadinessCard(
                  readiness: data,
                  isSubmitting: _isSubmitting,
                  onSubmit: _submitVerification,
                ),
                const SizedBox(height: AppSpacing.xl),
              ],
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.badge_outlined),
                title: Text(context.l10n.documentsTitle),
                subtitle: Text(context.l10n.documentsSubtitle),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push('/documents'),
              ),
              const SizedBox(height: AppSpacing.lg),
              const _VehiclesSection(),
              const SizedBox(height: AppSpacing.xl),
              const _RoutesSection(),
              const SizedBox(height: AppSpacing.xxxl),
            ],
          ),
        ),
      ),
    );
  }
}

// =====================================================================
//  Transport
// =====================================================================

class _VehiclesSection extends ConsumerWidget {
  const _VehiclesSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final vehicles = ref.watch(myVehiclesProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(context.l10n.vehiclesSectionTitle, style: theme.textTheme.titleSmall)),
            TextButton.icon(
              onPressed: () => _addVehicle(context, ref),
              icon: const Icon(Icons.add_rounded, size: AppSizes.iconSm),
              label: Text(context.l10n.actionAdd),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),

        vehicles.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
          ),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(myVehiclesProvider),
          ),
          data: (items) {
            if (items.isEmpty) {
              return _EmptyBlock(
                icon: Icons.local_shipping_outlined,
                // Foyda aytiladi, talab emas
                message: context.l10n.vehiclesEmptyHint,
              );
            }

            return Column(
              children: [for (final vehicle in items) _VehicleTile(vehicle: vehicle)],
            );
          },
        ),
      ],
    );
  }

  Future<void> _addVehicle(BuildContext context, WidgetRef ref) async {
    final added = await showAddVehicleSheet(context);
    if (added ?? false) {
      ref.invalidate(myVehiclesProvider);
      ref.invalidate(driverReadinessProvider);
    }
  }
}

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({required this.vehicle});

  final Vehicle vehicle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = vehicle.verificationStatus;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${vehicle.brand} ${vehicle.model}'.trim(),
                  style: theme.textTheme.bodyLarge,
                ),
              ),
              if (vehicle.isPrimary)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    context.l10n.vehiclePrimary,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              Text(
                vehicle.plateFormatted,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(width: AppSpacing.lg),
              Text(
                context.weight(vehicle.capacityKg),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Icon(
                status.isVerified
                    ? Icons.verified_rounded
                    : Icons.schedule_rounded,
                size: 14,
                color: status.isVerified ? AppColors.success : AppColors.gray400,
              ),
              const SizedBox(width: AppSpacing.xs),
              Text(
                status.localized(context.l10n),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: status.isVerified ? AppColors.success : AppColors.textSecondary,
                ),
              ),
            ],
          ),
          // Tasdiqlanmagan transport bilan taklif yuborib boʻlmaydi —
          // buni aytmaslik eng koʻp savol tugʻdiradigan holat
          if (!status.isVerified) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              context.l10n.vehicleNotVerifiedNote,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// =====================================================================
//  Yo'nalishlar
// =====================================================================

class _RoutesSection extends ConsumerWidget {
  const _RoutesSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final routes = ref.watch(driverRoutesProvider);
    final bundle = ref.watch(referenceProvider).valueOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(context.l10n.routesSectionTitle, style: theme.textTheme.titleSmall),
            ),
            TextButton.icon(
              onPressed: () => _addRoute(context, ref),
              icon: const Icon(Icons.add_rounded, size: AppSizes.iconSm),
              label: Text(context.l10n.actionAdd),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),

        routes.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
          ),
          error: (error, _) => ErrorState(
            error: error,
            onRetry: () => ref.invalidate(driverRoutesProvider),
          ),
          data: (items) {
            if (items.isEmpty) {
              return _EmptyBlock(
                icon: Icons.route_outlined,
                // MATCHING UCHUN ENG KUCHLI SIGNAL — foydani aytamiz
                message: context.l10n.routesEmptyHint,
              );
            }

            return Column(
              children: [
                for (final route in items)
                  _RouteTile(
                    route: route,
                    bundle: bundle,
                    onRemove: () => _removeRoute(context, ref, route),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }

  Future<void> _addRoute(BuildContext context, WidgetRef ref) async {
    final added = await showAddRouteSheet(context);
    if (added ?? false) {
      ref.invalidate(driverRoutesProvider);
      ref.invalidate(driverReadinessProvider);
    }
  }

  Future<void> _removeRoute(
    BuildContext context,
    WidgetRef ref,
    DriverRoute route,
  ) async {
    try {
      await ref.read(profileRepositoryProvider).removeRoute(route.id);
      ref.invalidate(driverRoutesProvider);
      ref.invalidate(driverReadinessProvider);
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
}

class _RouteTile extends StatelessWidget {
  const _RouteTile({required this.route, required this.onRemove, this.bundle});

  final DriverRoute route;
  final VoidCallback onRemove;

  /// Viloyat nomlari joriy tilda shundan olinadi; spravochnik hali
  /// yuklanmagan bo'lsa server nomi ko'rsatiladi.
  final ReferenceBundle? bundle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.route_rounded,
            size: AppSizes.iconSm,
            color: AppColors.gray400,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  route.localizedLabel(
                    context.l10n,
                    regionName: (id) => bundle?.regionById(id)?.name.of(context.language),
                  ),
                  style: theme.textTheme.bodyMedium,
                ),
                if (route.isRegular)
                  Text(
                    context.l10n.routeRegular,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.primary,
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close_rounded, size: AppSizes.iconSm),
            color: AppColors.gray400,
            onPressed: onRemove,
            tooltip: context.l10n.actionDelete,
          ),
        ],
      ),
    );
  }
}

class _EmptyBlock extends StatelessWidget {
  const _EmptyBlock({required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: AppSizes.iconMd, color: AppColors.gray400),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =====================================================================
//  Qo'shish oynalari
// =====================================================================

/// Transport qo'shish.
Future<bool?> showAddVehicleSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    ),
    builder: (context) => const _AddVehicleSheet(),
  );
}

class _AddVehicleSheet extends ConsumerStatefulWidget {
  const _AddVehicleSheet();

  @override
  ConsumerState<_AddVehicleSheet> createState() => _AddVehicleSheetState();
}

class _AddVehicleSheetState extends ConsumerState<_AddVehicleSheet> {
  final _brandController = TextEditingController();
  final _modelController = TextEditingController();
  final _plateController = TextEditingController();
  final _capacityController = TextEditingController();

  int? _vehicleTypeId;
  int? _bodyTypeId;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _brandController.dispose();
    _modelController.dispose();
    _plateController.dispose();
    _capacityController.dispose();
    super.dispose();
  }

  int get _capacity =>
      int.tryParse(_capacityController.text.replaceAll(RegExp(r'[^\d]'), '')) ?? 0;

  bool get _isValid =>
      _vehicleTypeId != null &&
      _bodyTypeId != null &&
      _brandController.text.trim().isNotEmpty &&
      // Davlat raqami: 8 belgi (01A123BC)
      _plateController.text.replaceAll(' ', '').length >= 8 &&
      _capacity > 0;

  Future<void> _submit() async {
    if (!_isValid || _isSubmitting) return;
    setState(() => _isSubmitting = true);

    try {
      await ref.read(vehiclesRepositoryProvider).create({
        'vehicleTypeId': _vehicleTypeId,
        'bodyTypeId': _bodyTypeId,
        'brand': _brandController.text.trim(),
        'model': _modelController.text.trim(),
        'plateNumber': _plateController.text.replaceAll(' ', '').toUpperCase(),
        'capacityKg': _capacity,
      });

      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(context, error)),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reference = ref.watch(referenceProvider);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.gray200,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(context.l10n.addVehicleTitle, style: theme.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.lg),

            reference.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(AppSpacing.xl),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
              ),
              error: (error, _) => ErrorState(
                error: error,
                onRetry: () => ref.invalidate(referenceProvider),
              ),
              data: (bundle) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _TypeChips(
                    label: context.l10n.fieldVehicleType,
                    options: {
                      for (final type in bundle.vehicleTypes)
                        type.id: '${type.name.of(context.language)} · ${type.capacityLabelFor(context.l10n.units)}',
                    },
                    selected: _vehicleTypeId,
                    onChanged: (id) => setState(() => _vehicleTypeId = id),
                  ),
                  _TypeChips(
                    label: context.l10n.fieldBodyType,
                    options: {
                      for (final type in bundle.bodyTypes) type.id: type.name.of(context.language),
                    },
                    selected: _bodyTypeId,
                    onChanged: (id) => setState(() => _bodyTypeId = id),
                  ),
                ],
              ),
            ),

            _Field(
              label: context.l10n.fieldBrand,
              controller: _brandController,
              hint: 'Isuzu',
              onChanged: () => setState(() {}),
            ),
            _Field(
              label: context.l10n.fieldModel,
              controller: _modelController,
              hint: 'NPR',
              onChanged: () => setState(() {}),
            ),
            _Field(
              label: context.l10n.fieldPlate,
              controller: _plateController,
              hint: '01 A 123 BC',
              textCapitalization: TextCapitalization.characters,
              onChanged: () => setState(() {}),
            ),
            _Field(
              label: context.l10n.fieldCapacityKg,
              controller: _capacityController,
              hint: '5000',
              keyboardType: TextInputType.number,
              onChanged: () => setState(() {}),
            ),

            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: context.l10n.actionAdd,
              isLoading: _isSubmitting,
              onPressed: _isValid ? _submit : null,
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ),
      ),
    );
  }
}

/// Yo'nalish qo'shish.
Future<bool?> showAddRouteSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    ),
    builder: (context) => const _AddRouteSheet(),
  );
}

class _AddRouteSheet extends ConsumerStatefulWidget {
  const _AddRouteSheet();

  @override
  ConsumerState<_AddRouteSheet> createState() => _AddRouteSheetState();
}

class _AddRouteSheetState extends ConsumerState<_AddRouteSheet> {
  int? _fromRegionId;
  int? _toRegionId;
  bool _isRegular = false;
  bool _isSubmitting = false;

  Future<void> _submit() async {
    if (_fromRegionId == null || _isSubmitting) return;
    setState(() => _isSubmitting = true);

    try {
      await ref.read(profileRepositoryProvider).addRoute(
            fromRegionId: _fromRegionId!,
            toRegionId: _toRegionId,
            isRegular: _isRegular,
          );

      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(context, error)),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reference = ref.watch(referenceProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.gray200,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(context.l10n.addRouteTitle, style: theme.textTheme.titleMedium),
          const SizedBox(height: AppSpacing.xs),
          Text(
            context.l10n.addRouteHint,
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          reference.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.xl),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
            ),
            error: (error, _) => ErrorState(
              error: error,
              onRetry: () => ref.invalidate(referenceProvider),
            ),
            data: (bundle) {
              final regions = {
                for (final region in bundle.regions) region.id: region.name.of(context.language),
              };

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _TypeChips(
                    label: context.l10n.fieldFrom,
                    options: regions,
                    selected: _fromRegionId,
                    onChanged: (id) => setState(() => _fromRegionId = id),
                  ),
                  _TypeChips(
                    label: context.l10n.fieldTo,
                    // Boʻsh tanlov — "istalgan yoʻnalishga"
                    helper: context.l10n.fieldToHelper,
                    options: regions,
                    selected: _toRegionId,
                    onChanged: (id) => setState(
                      () => _toRegionId = _toRegionId == id ? null : id,
                    ),
                  ),
                ],
              );
            },
          ),

          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _isRegular,
            onChanged: (value) => setState(() => _isRegular = value),
            title: Text(context.l10n.routeRegular),
            subtitle: Text(context.l10n.routeRegularHint),
          ),
          const SizedBox(height: AppSpacing.md),

          AppButton(
            label: context.l10n.actionAdd,
            isLoading: _isSubmitting,
            onPressed: _fromRegionId == null ? null : _submit,
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ),
    );
  }
}

/// Bitta tanlovli belgilar guruhi.
class _TypeChips extends StatelessWidget {
  const _TypeChips({
    required this.label,
    required this.options,
    required this.selected,
    required this.onChanged,
    this.helper,
  });

  final String label;
  final Map<int, String> options;
  final int? selected;
  final ValueChanged<int> onChanged;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelLarge?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          if (helper != null)
            Text(
              helper!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final entry in options.entries)
                FilterChip(
                  label: Text(entry.value),
                  selected: selected == entry.key,
                  onSelected: (_) => onChanged(entry.key),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.controller,
    required this.onChanged,
    this.hint,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.words,
  });

  final String label;
  final TextEditingController controller;
  final VoidCallback onChanged;
  final String? hint;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelLarge?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: controller,
            keyboardType: keyboardType,
            textCapitalization: textCapitalization,
            onChanged: (_) => onChanged(),
            decoration: InputDecoration(hintText: hint),
          ),
        ],
      ),
    );
  }
}

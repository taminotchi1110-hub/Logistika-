import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/location/device_location.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_states.dart';
import '../data/geo_repository.dart';
import '../domain/place.dart';

final geoRepositoryProvider = Provider<GeoRepository>((ref) {
  return GeoRepository(ref.watch(apiClientProvider));
});

/// Manzil tanlash oynasi.
///
/// NEGA ALOHIDA OYNA (formadagi oddiy maydon emas): manzil — yukning
/// eng muhim maydoni. Noto'g'ri koordinata masofani, narxni va
/// matchingni buzadi. Shuning uchun foydalanuvchi ERKIN MATN
/// yozolmaydi: u ro'yxatdan tanlaydi va koordinata birga keladi.
///
/// Natija: tanlangan `Place` yoki `null` (bekor qilindi).
Future<Place?> showAddressPicker(
  BuildContext context, {
  required String title,
  String? initialQuery,
}) {
  return showModalBottomSheet<Place>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    ),
    builder: (context) => _AddressPickerSheet(
      title: title,
      initialQuery: initialQuery,
    ),
  );
}

class _AddressPickerSheet extends ConsumerStatefulWidget {
  const _AddressPickerSheet({required this.title, this.initialQuery});

  final String title;
  final String? initialQuery;

  @override
  ConsumerState<_AddressPickerSheet> createState() => _AddressPickerSheetState();
}

class _AddressPickerSheetState extends ConsumerState<_AddressPickerSheet> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialQuery ?? '');

  Timer? _debounce;
  List<Place> _results = const [];
  bool _isSearching = false;
  bool _isLocating = false;
  Object? _error;

  /// Har bir qidiruvning tartib raqami.
  ///
  /// Foydalanuvchi tez yozganda so'rovlar bir-birini quvib yetadi va
  /// ESKI so'rov KEYIN qaytishi mumkin — natijada ekranda eskirgan
  /// ro'yxat qoladi. Shuning uchun faqat oxirgi so'rovning javobi
  /// qabul qilinadi.
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    if ((widget.initialQuery ?? '').trim().length >= 3) {
      _search(widget.initialQuery!);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();

    if (value.trim().length < 3) {
      setState(() {
        _results = const [];
        _isSearching = false;
        _error = null;
      });
      return;
    }

    // 400 ms: har bir harfda so'rov yuborish provayder limitini
    // tez tugatadi va ro'yxat sakrab turadi
    _debounce = Timer(const Duration(milliseconds: 400), () => _search(value));
  }

  Future<void> _search(String query) async {
    final id = ++_requestId;
    setState(() {
      _isSearching = true;
      _error = null;
    });

    try {
      final places = await ref.read(geoRepositoryProvider).search(query);
      if (!mounted || id != _requestId) return;
      setState(() {
        _results = places;
        _isSearching = false;
      });
    } on ApiException catch (error) {
      if (!mounted || id != _requestId) return;
      setState(() {
        _error = error;
        _isSearching = false;
      });
    }
  }

  /// "Mening joylashuvim" — GPS dan olib, teskari geokodlash.
  Future<void> _useCurrentLocation() async {
    setState(() => _isLocating = true);

    try {
      final position = await ref.read(locationResolverProvider)();
      if (position == null) {
        if (!mounted) return;
        setState(() => _isLocating = false);
        _showMessage('Joylashuvga ruxsat berilmagan');
        return;
      }

      final place = await ref.read(geoRepositoryProvider).reverse(
            lat: position.lat,
            lng: position.lng,
          );

      if (!mounted) return;
      Navigator.pop(context, place);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _isLocating = false);
      _showMessage(localizeError(error));
    } on Object {
      if (!mounted) return;
      setState(() => _isLocating = false);
      _showMessage('Joylashuvni aniqlab boʻlmadi');
    }
  }

  void _showMessage(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Klaviatura ochilganda oyna qisqarmasligi uchun
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.85,
        child: Column(
          children: [
            const SizedBox(height: AppSpacing.md),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.gray200,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.md,
              ),
              child: Row(
                children: [
                  Expanded(child: Text(widget.title, style: theme.textTheme.titleMedium)),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: TextField(
                controller: _controller,
                autofocus: true,
                textInputAction: TextInputAction.search,
                onChanged: _onChanged,
                onSubmitted: _search,
                decoration: InputDecoration(
                  hintText: 'Koʻcha, mahalla yoki obyekt nomi',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _controller.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear_rounded),
                          onPressed: () {
                            _controller.clear();
                            _onChanged('');
                            setState(() {});
                          },
                        ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            ListTile(
              leading: _isLocating
                  ? const SizedBox(
                      width: AppSizes.iconMd,
                      height: AppSizes.iconMd,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    )
                  : const Icon(Icons.my_location_rounded, color: AppColors.primary),
              title: const Text('Mening joylashuvim'),
              onTap: _isLocating ? null : _useCurrentLocation,
            ),
            const Divider(height: 1),
            Expanded(child: _body(theme)),
          ],
        ),
      ),
    );
  }

  Widget _body(ThemeData theme) {
    if (_error != null) {
      return ErrorState(
        error: _error!,
        onRetry: () => _search(_controller.text),
      );
    }

    if (_isSearching && _results.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(top: AppSpacing.xxxl),
        child: LoadingState(),
      );
    }

    if (_controller.text.trim().length < 3) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Kamida 3 ta harf kiriting',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Masalan: "Chilonzor 19", "Yunusobod bozori" yoki '
              '"Samarqand Registon".',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      );
    }

    if (_results.isEmpty) {
      return const EmptyState(
        icon: Icons.location_off_outlined,
        title: 'Manzil topilmadi',
        message: 'Nomni boshqacha yozib koʻring yoki yaqin obyekt nomini kiriting '
            '— masalan bozor, bekat yoki koʻcha nomi.',
      );
    }

    return ListView.separated(
      itemCount: _results.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: AppSpacing.xxl),
      itemBuilder: (context, index) {
        final place = _results[index];

        return ListTile(
          leading: const Icon(Icons.place_outlined, color: AppColors.gray400),
          title: Text(place.primary, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text(
            place.secondary,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall,
          ),
          onTap: () => Navigator.pop(context, place),
        );
      },
    );
  }
}

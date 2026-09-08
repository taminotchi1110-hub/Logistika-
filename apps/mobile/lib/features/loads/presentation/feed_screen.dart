import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_states.dart';
import '../data/loads_repository.dart';
import '../domain/load.dart';
import 'widgets/load_card.dart';

final loadsRepositoryProvider = Provider<LoadsRepository>((ref) {
  return LoadsRepository(ref.watch(apiClientProvider));
});

/// Lenta holati: sahifalash bilan.
class FeedState {
  const FeedState({
    this.loads = const [],
    this.filter = const LoadFilter(),
    this.cursor,
    this.hasMore = true,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  final List<Load> loads;
  final LoadFilter filter;
  final String? cursor;
  final bool hasMore;
  final bool isLoading;
  final bool isLoadingMore;
  final Object? error;

  bool get isEmpty => loads.isEmpty && !isLoading && error == null;

  FeedState copyWith({
    List<Load>? loads,
    LoadFilter? filter,
    String? cursor,
    bool? hasMore,
    bool? isLoading,
    bool? isLoadingMore,
    Object? error,
    bool clearError = false,
  }) {
    return FeedState(
      loads: loads ?? this.loads,
      filter: filter ?? this.filter,
      cursor: cursor,
      hasMore: hasMore ?? this.hasMore,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class FeedNotifier extends StateNotifier<FeedState> {
  FeedNotifier(this._repository) : super(const FeedState()) {
    refresh();
  }

  final LoadsRepository _repository;

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, clearError: true, cursor: null);

    try {
      final page = await _repository.feed(filter: state.filter);
      state = state.copyWith(
        loads: page.items,
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        isLoading: false,
      );
    } on ApiException catch (error) {
      state = state.copyWith(isLoading: false, error: error);
    }
  }

  /// Keyingi sahifa.
  ///
  /// Bir vaqtda ikkita so'rov ketmasligi uchun `isLoadingMore` bayrog'i:
  /// foydalanuvchi tez aylantirsa `ScrollController` bir necha marta
  /// chaqiradi va bir xil sahifa ikki marta qo'shilib qolardi.
  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore || state.cursor == null) return;

    state = state.copyWith(isLoadingMore: true);

    try {
      final page = await _repository.feed(
        filter: state.filter,
        cursor: state.cursor,
      );
      state = state.copyWith(
        loads: [...state.loads, ...page.items],
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        isLoadingMore: false,
      );
    } on ApiException {
      // Keyingi sahifa yuklanmasa — jimgina to'xtaymiz. Xato
      // ko'rsatish mavjud ro'yxatni buzadi va foydasi kam.
      state = state.copyWith(isLoadingMore: false, hasMore: false);
    }
  }

  Future<void> applyFilter(LoadFilter filter) async {
    state = state.copyWith(filter: filter, loads: const []);
    await refresh();
  }
}

final feedProvider = StateNotifierProvider<FeedNotifier, FeedState>((ref) {
  return FeedNotifier(ref.watch(loadsRepositoryProvider));
});

/// Haydovchi lentasi — ilovaning eng ko'p ishlatiladigan ekrani.
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    // Oxirigacha 400 piksel qolganda keyingi sahifani yuklaymiz —
    // foydalanuvchi "yuklanmoqda" ni ko'rmasligi kerak
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 400) {
      ref.read(feedProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(feedProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Yuklar'),
        actions: [
          // Filtr tugmasi — yoqilgan filtrlar soni belgisi bilan
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            child: Stack(
              children: [
                IconButton(
                  icon: const Icon(Icons.tune_rounded),
                  tooltip: 'Filtr',
                  onPressed: () => _openFilters(context),
                ),
                if (state.filter.activeCount > 0)
                  Positioned(
                    right: 6,
                    top: 6,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                      child: Text(
                        '${state.filter.activeCount}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(feedProvider.notifier).refresh(),
        child: _body(state),
      ),
    );
  }

  Widget _body(FeedState state) {
    if (state.isLoading && state.loads.isEmpty) {
      return const _FeedSkeleton();
    }

    if (state.error != null && state.loads.isEmpty) {
      return ListView(
        // `AlwaysScrollableScrollPhysics` — bo'sh ekranda ham pastga
        // tortib yangilash ishlashi uchun
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
          ErrorState(
            error: state.error!,
            onRetry: () => ref.read(feedProvider.notifier).refresh(),
          ),
        ],
      );
    }

    if (state.isEmpty) {
      final hasFilters = state.filter.activeCount > 0;

      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
          EmptyState(
            icon: Icons.explore_off_outlined,
            title: hasFilters ? 'Filtrga mos yuk yoʻq' : 'Hozircha yuk yoʻq',
            message: hasFilters
                ? 'Filtrni kengaytiring — masalan masofa yoki ogʻirlik chegarasini oshiring'
                : 'Yangi eʼlonlar paydo boʻlishi bilan bu yerda koʻrinadi. '
                    'Yoʻnalishlaringizni sozlasangiz mos yuklar haqida xabar beramiz.',
            actionLabel: hasFilters ? 'Filtrni tozalash' : null,
            onAction: hasFilters
                ? () => ref
                    .read(feedProvider.notifier)
                    .applyFilter(const LoadFilter())
                : null,
          ),
        ],
      );
    }

    return ListView.separated(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.lg),
      // Oxirgi element — yuklanish indikatori yoki "hammasi" yozuvi
      itemCount: state.loads.length + 1,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
      itemBuilder: (context, index) {
        if (index == state.loads.length) return _footer(state);

        final load = state.loads[index];
        return LoadCard(
          load: load,
          showMatchScore: true,
          onTap: () => context.push('/load/${load.id}'),
        );
      },
    );
  }

  Widget _footer(FeedState state) {
    if (state.isLoadingMore) {
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.xl),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
      );
    }

    if (!state.hasMore && state.loads.length > 5) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Center(
          child: Text(
            'Hammasi shu',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
          ),
        ),
      );
    }

    return const SizedBox(height: AppSpacing.xl);
  }

  void _openFilters(BuildContext context) {
    // Filtr oynasi keyingi bosqichda
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Filtr oynasi tayyorlanmoqda')),
    );
  }
}

/// Yuklanish paytidagi skelet.
class _FeedSkeleton extends StatelessWidget {
  const _FeedSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(AppSpacing.lg),
      itemCount: 4,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
      itemBuilder: (context, index) => Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: AppColors.border),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: SkeletonBox(height: 20)),
                SizedBox(width: AppSpacing.lg),
                SkeletonBox(height: 20, width: 80),
              ],
            ),
            SizedBox(height: AppSpacing.sm),
            SkeletonBox(height: 14, width: 160),
            SizedBox(height: AppSpacing.lg),
            SkeletonBox(height: 14),
          ],
        ),
      ),
    );
  }
}

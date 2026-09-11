import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/load.dart';
import 'feed_screen.dart' show loadsRepositoryProvider;
import 'widgets/load_card.dart';
import 'package:karvon/core/l10n/formatters.dart';
import 'package:karvon/l10n/app_localizations.dart';

/// "Yuklarim" bandlari.
///
/// Backend guruh nomlarini qabul qiladi — mijozda ichki statuslar
/// takrorlanmaydi. Statuslar roʻyxati kelajakda oʻzgarsa, ilovani
/// yangilash shart boʻlmaydi.
enum MyLoadsTab {
  active('active'),
  draft('draft'),
  completed('completed'),
  cancelled('cancelled');

  const MyLoadsTab(this.apiValue);

  final String apiValue;

  String label(AppLocalizations l10n) => switch (this) {
        MyLoadsTab.active => l10n.myLoadsTabActive,
        MyLoadsTab.draft => l10n.myLoadsTabDraft,
        MyLoadsTab.completed => l10n.myLoadsTabCompleted,
        MyLoadsTab.cancelled => l10n.myLoadsTabCancelled,
      };
}

class MyLoadsState {
  const MyLoadsState({
    this.loads = const [],
    this.cursor,
    this.hasMore = true,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  final List<Load> loads;
  final String? cursor;
  final bool hasMore;
  final bool isLoading;
  final bool isLoadingMore;
  final Object? error;

  bool get isEmpty => loads.isEmpty && !isLoading && error == null;

  MyLoadsState copyWith({
    List<Load>? loads,
    String? cursor,
    bool? hasMore,
    bool? isLoading,
    bool? isLoadingMore,
    Object? error,
    bool clearError = false,
  }) {
    return MyLoadsState(
      loads: loads ?? this.loads,
      cursor: cursor,
      hasMore: hasMore ?? this.hasMore,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class MyLoadsNotifier extends StateNotifier<MyLoadsState> {
  MyLoadsNotifier(this._ref, this._tab) : super(const MyLoadsState()) {
    refresh();
  }

  final Ref _ref;
  final MyLoadsTab _tab;

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, clearError: true, cursor: null);

    try {
      final page = await _ref
          .read(loadsRepositoryProvider)
          .myLoads(status: _tab.apiValue);

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

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore || state.cursor == null) return;

    state = state.copyWith(isLoadingMore: true);

    try {
      final page = await _ref
          .read(loadsRepositoryProvider)
          .myLoads(status: _tab.apiValue, cursor: state.cursor);

      state = state.copyWith(
        loads: [...state.loads, ...page.items],
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        isLoadingMore: false,
      );
    } on ApiException {
      state = state.copyWith(isLoadingMore: false, hasMore: false);
    }
  }
}

/// Har bir band uchun alohida holat.
///
/// `family` — bandlar orasida almashganda roʻyxat qaytadan
/// yuklanmasligi uchun: foydalanuvchi "Faol" ga qaytsa, oldingi
/// natija joyida turadi.
final myLoadsProvider =
    StateNotifierProvider.family<MyLoadsNotifier, MyLoadsState, MyLoadsTab>(
  (ref, tab) => MyLoadsNotifier(ref, tab),
);

/// Mijozning yuk eʼlonlari.
class MyLoadsScreen extends ConsumerStatefulWidget {
  const MyLoadsScreen({super.key});

  @override
  ConsumerState<MyLoadsScreen> createState() => _MyLoadsScreenState();
}

class _MyLoadsScreenState extends ConsumerState<MyLoadsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController =
      TabController(length: MyLoadsTab.values.length, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(context.l10n.tabMyLoads),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            for (final tab in MyLoadsTab.values) Tab(text: tab.label(context.l10n)),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          for (final tab in MyLoadsTab.values) _TabView(tab: tab),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createLoad(context),
        icon: const Icon(Icons.add_rounded),
        label: Text(context.l10n.actionAddLoad),
      ),
    );
  }

  Future<void> _createLoad(BuildContext context) async {
    final created = await context.push<Load>('/load/new');
    if (created == null || !mounted) return;

    // Qaysi bandga tushganini bilamiz — oʻshanisini yangilaymiz va
    // foydalanuvchini oʻsha yerga olib oʻtamiz. Aks holda u yangi
    // eʼlonni koʻrmay "saqlanmadimi?" deb oʻylaydi.
    final tab = created.status == LoadStatus.draft
        ? MyLoadsTab.draft
        : MyLoadsTab.active;

    _tabController.animateTo(MyLoadsTab.values.indexOf(tab));
    await ref.read(myLoadsProvider(tab).notifier).refresh();
  }
}

class _TabView extends ConsumerStatefulWidget {
  const _TabView({required this.tab});

  final MyLoadsTab tab;

  @override
  ConsumerState<_TabView> createState() => _TabViewState();
}

class _TabViewState extends ConsumerState<_TabView>
    with AutomaticKeepAliveClientMixin {
  final _scrollController = ScrollController();

  // Bandlar orasida almashganda roʻyxat holati saqlanadi
  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      final position = _scrollController.position;
      if (position.pixels >= position.maxScrollExtent - 400) {
        ref.read(myLoadsProvider(widget.tab).notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = ref.watch(myLoadsProvider(widget.tab));
    final notifier = ref.read(myLoadsProvider(widget.tab).notifier);

    return RefreshIndicator(
      onRefresh: notifier.refresh,
      child: switch (state) {
        MyLoadsState(isLoading: true, loads: []) => const LoadingState(),
        MyLoadsState(error: final error?, loads: []) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
              ErrorState(error: error, onRetry: notifier.refresh),
            ],
          ),
        MyLoadsState(isEmpty: true) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(height: MediaQuery.sizeOf(context).height * 0.12),
              EmptyState(
                icon: _emptyIcon,
                title: _emptyTitle,
                message: _emptyMessage,
              ),
            ],
          ),
        _ => ListView.separated(
            controller: _scrollController,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              // Suzuvchi tugma oxirgi kartochkani toʻsmasligi uchun
              AppSpacing.xxxl * 2.5,
            ),
            itemCount: state.loads.length + (state.isLoadingMore ? 1 : 0),
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, index) {
              if (index == state.loads.length) {
                return const Padding(
                  padding: EdgeInsets.all(AppSpacing.xl),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
                );
              }

              final load = state.loads[index];
              return LoadCard(
                load: load,
                showStatus: true,
                onTap: () => context.push('/load/${load.id}'),
              );
            },
          ),
      },
    );
  }

  IconData get _emptyIcon => switch (widget.tab) {
        MyLoadsTab.active => Icons.inventory_2_outlined,
        MyLoadsTab.draft => Icons.edit_note_rounded,
        MyLoadsTab.completed => Icons.check_circle_outline_rounded,
        MyLoadsTab.cancelled => Icons.cancel_outlined,
      };

  String get _emptyTitle => switch (widget.tab) {
        MyLoadsTab.active => context.l10n.myLoadsEmptyActive,
        MyLoadsTab.draft => context.l10n.myLoadsEmptyDraft,
        MyLoadsTab.completed => context.l10n.myLoadsEmptyCompleted,
        MyLoadsTab.cancelled => context.l10n.myLoadsEmptyCancelled,
      };

  String get _emptyMessage => switch (widget.tab) {
        MyLoadsTab.active => context.l10n.myLoadsEmptyActiveHint,
        MyLoadsTab.draft => context.l10n.myLoadsEmptyDraftHint,
        MyLoadsTab.completed => context.l10n.myLoadsEmptyCompletedHint,
        MyLoadsTab.cancelled => context.l10n.myLoadsEmptyCancelledHint,
      };
}

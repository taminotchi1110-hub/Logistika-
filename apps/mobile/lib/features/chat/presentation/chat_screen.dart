import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/ws/socket_client.dart';
import '../../../core/ws/ws_providers.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/conversation.dart';
import 'chat_providers.dart';
import 'widgets/message_bubble.dart';

/// Suhbat ekrani.
///
/// IKKI MANBA BIR ROʻYXATDA:
///   1. **Tarix** — REST orqali, sahifalanadi (WebSocket tarixni bermaydi).
///   2. **Jonli xabarlar** — WebSocket orqali.
///
/// OPTIMISTIK YUBORISH: xabar darhol roʻyxatga qoʻshiladi va
/// "yuborilmoqda" belgisi bilan turadi. Foydalanuvchi tarmoqni
/// kutmaydi — bu chat ilovasida asosiy talab. Server javob berganda
/// vaqtinchalik xabar haqiqiysi bilan almashtiriladi.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({
    required this.conversationId,
    this.title,
    this.subtitle,
    this.canWrite = true,
    super.key,
  });

  final String conversationId;
  final String? title;
  final String? subtitle;

  /// Yopilgan buyurtmada yozib boʻlmaydi, lekin oʻqish mumkin.
  final bool canWrite;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  final _random = Random();

  /// Roʻyxat ENG YANGISI BIRINCHI tartibida saqlanadi va
  /// `reverse: true` bilan chiziladi — chat pastdan boshlanadi.
  final _messages = <ChatMessage>[];

  StreamSubscription<RealtimeMessage>? _messageSubscription;

  /// Provayder konteyneri — `dispose()` da `ref` ISHLAMAYDI.
  ///
  /// Riverpod widget yoʻq qilingandan keyin `ref` ga murojaatni taqiqlaydi
  /// ("Cannot use ref after the widget was disposed"). Konteyner esa
  /// widget'dan uzoqroq yashaydi va tozalash ishlarini bajarish uchun
  /// mos: aks holda ekrandan chiqishda ilova xato beradi va suhbat
  /// xonasida qolib ketadi — keyingi xabarlar boshqa ekranda ham keladi.
  late final ProviderContainer _container;

  late final SocketClient _socket;

  String? _cursor;
  bool _hasMore = true;
  bool _isLoading = true;
  bool _isLoadingMore = false;
  Object? _error;

  @override
  void initState() {
    super.initState();

    _scrollController.addListener(_onScroll);
    _loadHistory();

    _container = ProviderScope.containerOf(context, listen: false);
    _socket = _container.read(socketClientProvider);

    _socket.joinConversation(widget.conversationId);
    // Ekran ochilishi = xabarlar oʻqildi
    _socket.markRead(widget.conversationId);

    _messageSubscription = _socket.messages.listen(_onIncoming);

    // Bu suhbatdan kelgan xabar uchun banner koʻrsatilmaydi.
    // `addPostFrameCallback` — provayderni qurish paytida oʻzgartirish
    // mumkin emas
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _container.read(openConversationProvider.notifier).state =
            widget.conversationId;
      }
    });
  }

  @override
  void dispose() {
    _messageSubscription?.cancel();
    _socket.leaveConversation(widget.conversationId);

    // PROVAYDERNI `dispose()` ICHIDA OʻZGARTIRIB BOʻLMAYDI: Riverpod
    // buni taqiqlaydi ("Tried to modify a provider while the widget
    // tree was building"). Shuning uchun tozalash keyingi kadrga
    // suriladi — konteyner widget'dan uzoqroq yashaydi va oʻsha
    // paytda ham mavjud boʻladi.
    final container = _container;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        container.read(openConversationProvider.notifier).state = null;
        // Roʻyxatdagi oʻqilmaganlar belgisi yangilanadi
        container.invalidate(conversationsProvider);
      } on StateError {
        // Konteyner ham yopilgan (ilova yopilyapti yoki chiqib
        // ketilgan) — tozalashning maʼnosi qolmagan
      }
    });

    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    // `reverse: true` da "oxiri" — eng eski xabarlar tomoni
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 200) _loadMore();
  }

  Future<void> _loadHistory() async {
    try {
      final page = await ref
          .read(chatRepositoryProvider)
          .messages(widget.conversationId);

      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(page.items);
        _cursor = page.nextCursor;
        _hasMore = page.hasMore;
        _isLoading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _isLoading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore || !_hasMore || _cursor == null) return;

    setState(() => _isLoadingMore = true);

    try {
      final page = await ref
          .read(chatRepositoryProvider)
          .messages(widget.conversationId, cursor: _cursor);

      if (!mounted) return;
      setState(() {
        _messages.addAll(page.items);
        _cursor = page.nextCursor;
        _hasMore = page.hasMore;
        _isLoadingMore = false;
      });
    } on ApiException {
      // Eski xabarlar yuklanmasa jimgina toʻxtaymiz: mavjud suhbatni
      // xato bilan buzish foydadan koʻra zarar
      if (!mounted) return;
      setState(() {
        _isLoadingMore = false;
        _hasMore = false;
      });
    }
  }

  /// WebSocket'dan kelgan xabar.
  void _onIncoming(RealtimeMessage incoming) {
    if (incoming.conversationId != widget.conversationId) return;
    if (!mounted) return;

    setState(() {
      // Oʻzim yuborgan xabar qaytib keldi — vaqtinchalikni almashtiramiz
      final pendingIndex = _messages.indexWhere(
        (message) => message.isPending && message.body == incoming.body,
      );

      final message = ChatMessage(
        id: incoming.id,
        conversationId: incoming.conversationId,
        senderId: incoming.senderId,
        body: incoming.body,
        createdAt: incoming.createdAt,
        type: incoming.type,
        attachmentUrl: incoming.attachmentUrl,
      );

      if (pendingIndex >= 0) {
        _messages[pendingIndex] = message;
        return;
      }

      // Dublikat himoyasi: REST tarix va WebSocket bir xil xabarni
      // berishi mumkin (masalan qayta ulanishdan keyin)
      if (_messages.any((existing) => existing.id == message.id)) return;

      _messages.insert(0, message);
    });

    // Yangi xabar keldi — darhol oʻqilgan deb belgilaymiz, chunki
    // foydalanuvchi aynan shu ekranda turibdi
    _socket.markRead(widget.conversationId);
  }

  Future<void> _send() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;

    final clientMsgId = 'c${DateTime.now().microsecondsSinceEpoch}'
        '${_random.nextInt(1000)}';
    final myId = ref.read(currentUserProvider)?.id ?? '';

    final pending = ChatMessage.pending(
      conversationId: widget.conversationId,
      senderId: myId,
      body: text,
      clientMsgId: clientMsgId,
    );

    setState(() {
      _messages.insert(0, pending);
      _inputController.clear();
    });

    // Roʻyxat pastga (eng yangi xabarga) qaytadi
    _scrollToLatest();

    if (_socket.isConnected) {
      _socket.sendMessage(
        conversationId: widget.conversationId,
        body: text,
        clientMsgId: clientMsgId,
      );
      return;
    }

    // WebSocket yoʻq — REST zaxira yoʻli. Korporativ tarmoqlarda va
    // eski qurilmalarda WebSocket bloklangan boʻlishi mumkin
    try {
      final sent = await ref
          .read(chatRepositoryProvider)
          .send(widget.conversationId, text, clientMsgId: clientMsgId);

      if (!mounted) return;
      setState(() {
        final index = _messages.indexWhere((m) => m.clientMsgId == clientMsgId);
        if (index >= 0) _messages[index] = sent;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        final index = _messages.indexWhere((m) => m.clientMsgId == clientMsgId);
        if (index >= 0) {
          _messages[index] = _messages[index].copyWith(status: MessageStatus.failed);
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(error)),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  void _scrollToLatest() {
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isConnected = ref.watch(socketConnectedProvider).valueOrNull ?? false;
    final myId = ref.watch(currentUserProvider)?.id ?? '';

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.title ?? 'Suhbat', style: theme.textTheme.titleMedium),
            if (widget.subtitle != null)
              Text(
                widget.subtitle!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Aloqa uzilganini AYTAMIZ: aks holda foydalanuvchi javob
          // kelmaganini "hamkor javob bermayapti" deb tushunadi
          if (!isConnected) const _OfflineBar(),
          Expanded(child: _messageList(myId)),
          if (widget.canWrite) _composer() else const _ReadOnlyNotice(),
        ],
      ),
    );
  }

  Widget _messageList(String myId) {
    if (_isLoading) return const LoadingState();

    if (_error != null && _messages.isEmpty) {
      return ErrorState(
        error: _error!,
        onRetry: () {
          setState(() {
            _isLoading = true;
            _error = null;
          });
          _loadHistory();
        },
      );
    }

    if (_messages.isEmpty) {
      return const EmptyState(
        icon: Icons.chat_bubble_outline_rounded,
        title: 'Hali xabar yoʻq',
        message: 'Yozib, kelishuvni boshlang. Telefon raqami haydovchi yuk '
            'olish nuqtasiga yetib borgach ochiladi.',
      );
    }

    return ListView.builder(
      controller: _scrollController,
      // Chat pastdan boshlanadi: roʻyxat teskari chiziladi va yangi
      // xabar qoʻshilganda avtomatik koʻrinadi
      reverse: true,
      padding: const EdgeInsets.all(AppSpacing.lg),
      itemCount: _messages.length + (_isLoadingMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _messages.length) {
          return const Padding(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
          );
        }

        final message = _messages[index];
        // Keyingi element — VAQT boʻyicha oldingisi (roʻyxat teskari)
        final previous = index + 1 < _messages.length ? _messages[index + 1] : null;

        return MessageBubble(
          message: message,
          isMine: message.isMine(myId),
          showDaySeparator: _needsDaySeparator(message, previous),
        );
      },
    );
  }

  /// Kun almashganda ajratkich koʻrsatiladi.
  static bool _needsDaySeparator(ChatMessage message, ChatMessage? previous) {
    if (previous == null) return true;
    final a = message.createdAt.toLocal();
    final b = previous.createdAt.toLocal();
    return a.year != b.year || a.month != b.month || a.day != b.day;
  }

  Widget _composer() {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _inputController,
                minLines: 1,
                maxLines: 5,
                maxLength: 2000,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _send(),
                decoration: const InputDecoration(
                  hintText: 'Xabar yozing…',
                  counterText: '',
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            // Tugma faqat matn boʻlganda faol — boʻsh xabar yuborish
            // serverda ham rad etiladi
            IconButton.filled(
              onPressed: _inputController.text.trim().isEmpty ? null : _send,
              icon: const Icon(Icons.send_rounded),
              tooltip: 'Yuborish',
            ),
          ],
        ),
      ),
    );
  }
}

class _OfflineBar extends StatelessWidget {
  const _OfflineBar();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppColors.warningLight,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      child: Row(
        children: [
          const Icon(Icons.wifi_off_rounded, size: 14, color: AppColors.warning),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'Aloqa yoʻq — xabar tiklanganda yuboriladi',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.warning,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReadOnlyNotice extends StatelessWidget {
  const _ReadOnlyNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.gray100,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: SafeArea(
        top: false,
        child: Text(
          // Tarix oʻchirilmaydi: nizoda dalil sifatida kerak
          'Buyurtma yopilgan — bu suhbatda yozib boʻlmaydi. '
          'Yozishmalar tarixi saqlanadi.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
        ),
      ),
    );
  }
}

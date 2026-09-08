import '../../../core/api/api_client.dart';
import '../domain/conversation.dart';

/// Xabarlar sahifasi.
class MessagePage {
  const MessagePage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<ChatMessage> items;
  final String? nextCursor;
  final bool hasMore;
}

/// Chat REST qatlami.
///
/// ASOSIY OQIM WEBSOCKET ORQALI: xabar yuborish va qabul qilish
/// `SocketClient` da. Bu yerda tarix (WS xabar tarixini bermaydi) va
/// WebSocket ishlamagan holat uchun zaxira yo'l.
class ChatRepository {
  ChatRepository(this._api);

  final ApiClient _api;

  Future<List<Conversation>> conversations() async {
    final data = await _api.get<List<dynamic>>('/conversations');
    return data
        .map((item) => Conversation.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Xabarlar tarixi — ENG YANGISI BIRINCHI.
  ///
  /// Chat ekrani teskari ro'yxat (`reverse: true`) chizadi, shuning
  /// uchun tartib o'zgartirilmaydi: shu holda "yuqoriga aylantirish =
  /// eskisini yuklash" tabiiy ishlaydi.
  Future<MessagePage> messages(String conversationId, {String? cursor, int limit = 30}) async {
    final page = await _api.getPage(
      '/conversations/$conversationId/messages',
      query: {'limit': limit, if (cursor != null) 'cursor': cursor},
    );

    return MessagePage(
      items: page.items
          .map((item) => ChatMessage.fromJson(item as Map<String, dynamic>))
          .toList(),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    );
  }

  /// REST orqali yuborish — WebSocket ulanmagan bo'lsa.
  Future<ChatMessage> send(String conversationId, String body, {String? clientMsgId}) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/conversations/$conversationId/messages',
      body: {
        'body': body.trim(),
        if (clientMsgId != null) 'clientMsgId': clientMsgId,
      },
    );
    return ChatMessage.fromJson(data);
  }

  Future<void> markRead(String conversationId) async {
    await _api.post<dynamic>('/conversations/$conversationId/read');
  }
}

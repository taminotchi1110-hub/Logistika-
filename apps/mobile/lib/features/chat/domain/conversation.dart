import '../../orders/domain/order.dart';

/// Suhbatdagi bitta xabar.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.body,
    required this.createdAt,
    this.type = 'TEXT',
    this.attachmentUrl,
    this.attachmentName,
    this.readAt,
    this.status = MessageStatus.sent,
    this.clientMsgId,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id']?.toString() ?? '',
        conversationId: json['conversationId'] as String? ?? '',
        senderId: json['senderId'] as String? ?? '',
        body: json['body'] as String? ?? '',
        createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
        type: json['type'] as String? ?? 'TEXT',
        attachmentUrl: json['attachmentUrl'] as String?,
        attachmentName: json['attachmentName'] as String?,
        readAt: DateTime.tryParse('${json['readAt']}'),
      );

  final String id;
  final String conversationId;
  final String senderId;
  final String body;
  final DateTime createdAt;
  final String type;
  final String? attachmentUrl;
  final String? attachmentName;
  final DateTime? readAt;

  /// Yuborish holati — faqat mijoz tomonida.
  final MessageStatus status;

  /// Optimistik xabarni serverdan kelgani bilan almashtirish uchun.
  final String? clientMsgId;

  bool get isRead => readAt != null;
  bool get isPending => status != MessageStatus.sent;

  /// `isMine` SERVERDAN KELMAYDI (WebSocket'da).
  ///
  /// Bir xil payload ikkala tomonga tarqatiladi va ko'ruvchiga bog'liq
  /// maydon unda bo'lishi mumkin emas — aks holda qabul qiluvchi
  /// xabarni o'zining deb ko'radi va u noto'g'ri tomonda chiziladi.
  /// Backend'da bu xato bir marta yuz bergan (docs/15 §15.2).
  bool isMine(String myUserId) => senderId == myUserId;

  ChatMessage copyWith({
    String? id,
    DateTime? readAt,
    MessageStatus? status,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      conversationId: conversationId,
      senderId: senderId,
      body: body,
      createdAt: createdAt,
      type: type,
      attachmentUrl: attachmentUrl,
      attachmentName: attachmentName,
      readAt: readAt ?? this.readAt,
      status: status ?? this.status,
      clientMsgId: clientMsgId,
    );
  }

  /// Optimistik (hali yuborilmagan) xabar.
  static ChatMessage pending({
    required String conversationId,
    required String senderId,
    required String body,
    required String clientMsgId,
  }) {
    return ChatMessage(
      id: clientMsgId,
      conversationId: conversationId,
      senderId: senderId,
      body: body,
      createdAt: DateTime.now(),
      status: MessageStatus.sending,
      clientMsgId: clientMsgId,
    );
  }
}

/// Xabarning yuborilish holati.
///
/// NEGA KERAK: tarmoq uzilganda foydalanuvchi xabar ketdimi yoki
/// yo'qmi bilishi SHART. "Yuborilmoqda" belgisi bo'lmasa u xabarni
/// qayta yozadi va hamkor ikki marta oladi.
enum MessageStatus { sending, sent, failed }

/// Suhbatlar ro'yxatidagi element.
class Conversation {
  const Conversation({
    required this.id,
    required this.counterpartyName,
    required this.unreadCount,
    required this.canWrite,
    this.orderId,
    this.lastMessageBody,
    this.lastMessageAt,
    this.order,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final party = json['counterparty'] as Map<String, dynamic>? ?? const {};
    final last = json['lastMessage'] as Map<String, dynamic>?;
    final order = json['order'] as Map<String, dynamic>?;

    final name = [party['firstName'], party['lastName']]
        .where((part) => part != null && '$part'.isNotEmpty)
        .join(' ');

    return Conversation(
      id: json['id'] as String? ?? '',
      orderId: json['orderId'] as String?,
      counterpartyName: name.isEmpty ? 'Foydalanuvchi' : name,
      lastMessageBody: last?['body'] as String?,
      lastMessageAt: DateTime.tryParse('${last?['createdAt']}'),
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
      canWrite: json['canWrite'] as bool? ?? false,
      order: order == null ? null : ConversationOrder.fromJson(order),
    );
  }

  final String id;
  final String? orderId;
  final String counterpartyName;
  final String? lastMessageBody;
  final DateTime? lastMessageAt;
  final int unreadCount;

  /// Yopilgan buyurtmada yozib bo'lmaydi, lekin o'qish mumkin —
  /// nizoda dalil sifatida kerak.
  final bool canWrite;

  final ConversationOrder? order;

  bool get hasUnread => unreadCount > 0;

  String get initials {
    final parts = counterpartyName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }
}

/// Suhbat qaysi reysga tegishli.
class ConversationOrder {
  const ConversationOrder({
    required this.publicNo,
    required this.status,
    required this.statusLabel,
    required this.loadTitle,
    required this.pickup,
    required this.delivery,
  });

  factory ConversationOrder.fromJson(Map<String, dynamic> json) => ConversationOrder(
        publicNo: json['publicNo']?.toString() ?? '',
        status: OrderStatus.fromApi(json['status'] as String?),
        statusLabel: json['statusLabel'] as String? ?? '',
        loadTitle: json['loadTitle'] as String? ?? '',
        pickup: json['pickup'] as String? ?? '',
        delivery: json['delivery'] as String? ?? '',
      );

  final String publicNo;
  final OrderStatus status;
  final String statusLabel;
  final String loadTitle;
  final String pickup;
  final String delivery;

  String get route => '$pickup → $delivery';
}

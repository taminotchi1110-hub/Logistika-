import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/chat/domain/conversation.dart';
import 'package:karvon/features/orders/domain/order.dart';

/// Chat modellari — serverning haqiqiy javob shakli bo'yicha.
void main() {
  group('Conversation', () {
    final json = <String, dynamic>{
      'id': 'c-1',
      'orderId': 'o-1',
      'counterparty': {'id': 'u-1', 'firstName': 'Anvar', 'lastName': 'Karimov'},
      'lastMessage': {
        'body': 'Salom, qachon yetib borasiz?',
        'type': 'TEXT',
        'createdAt': '2026-09-08T10:00:00.000Z',
      },
      'unreadCount': 2,
      'canWrite': true,
      'order': {
        'publicNo': '195',
        'status': 'ASSIGNED',
        'statusLabel': 'Haydovchi tanlandi',
        'loadTitle': 'Mebel',
        'pickup': 'Toshkent shahri',
        'delivery': 'Samarqand',
      },
    };

    test('toʻliq oʻqiladi', () {
      final conversation = Conversation.fromJson(json);

      expect(conversation.id, 'c-1');
      expect(conversation.counterpartyName, 'Anvar Karimov');
      expect(conversation.initials, 'AK');
      expect(conversation.unreadCount, 2);
      expect(conversation.hasUnread, isTrue);
      expect(conversation.canWrite, isTrue);
      expect(conversation.lastMessageBody, 'Salom, qachon yetib borasiz?');
    });

    test('★ QAYSI REYS EKANI KOʻRINADI', () {
      // Bir foydalanuvchi bilan bir nechta reys boʻlishi mumkin va
      // ismlar bir xil koʻrinadi — yoʻnalish ularni ajratadi
      final order = Conversation.fromJson(json).order!;

      expect(order.publicNo, '195');
      expect(order.route, 'Toshkent shahri → Samarqand');
      expect(order.status, OrderStatus.assigned);
      expect(order.loadTitle, 'Mebel');
    });

    test('buyurtmasiz suhbat', () {
      final conversation = Conversation.fromJson({...json}..remove('order'));
      expect(conversation.order, isNull);
    });

    test('ismsiz foydalanuvchi', () {
      final conversation = Conversation.fromJson({
        ...json,
        'counterparty': {'id': 'u-1'},
      });

      expect(conversation.counterpartyName, 'Foydalanuvchi');
      expect(conversation.initials, 'F');
    });

    test('xabarsiz suhbat', () {
      final conversation = Conversation.fromJson({...json}..remove('lastMessage'));

      expect(conversation.lastMessageBody, isNull);
      expect(conversation.lastMessageAt, isNull);
    });
  });

  group('ChatMessage', () {
    final json = <String, dynamic>{
      'id': '115',
      'conversationId': 'c-1',
      'senderId': 'u-1',
      'isMine': false,
      'type': 'TEXT',
      'body': 'Salom',
      'attachmentUrl': null,
      'readAt': null,
      'createdAt': '2026-09-08T10:00:00.000Z',
    };

    test('server javobi oʻqiladi', () {
      final message = ChatMessage.fromJson(json);

      expect(message.id, '115');
      expect(message.body, 'Salom');
      expect(message.status, MessageStatus.sent);
      expect(message.isRead, isFalse);
      expect(message.isPending, isFalse);
    });

    test('★ TOMONI MIJOZ TOMONIDA ANIQLANADI', () {
      // `isMine` WebSocket broadcast'ida BOʻLMAYDI: bitta payload
      // ikkala tomonga ketadi va koʻruvchiga bogʻliq maydon unda
      // boʻlishi mumkin emas
      final message = ChatMessage.fromJson(json);

      expect(message.isMine('u-1'), isTrue);
      expect(message.isMine('u-2'), isFalse);
    });

    test('oʻqilgan belgisi', () {
      final message = ChatMessage.fromJson({
        ...json,
        'readAt': '2026-09-08T10:01:00.000Z',
      });

      expect(message.isRead, isTrue);
    });

    test('★ OPTIMISTIK XABAR "YUBORILMOQDA" HOLATIDA', () {
      // Belgi boʻlmasa foydalanuvchi xabarni qayta yozadi va hamkor
      // uni ikki marta oladi
      final pending = ChatMessage.pending(
        conversationId: 'c-1',
        senderId: 'u-1',
        body: 'Yoʻldaman',
        clientMsgId: 'tmp-1',
      );

      expect(pending.status, MessageStatus.sending);
      expect(pending.isPending, isTrue);
      expect(pending.id, 'tmp-1');
      expect(pending.clientMsgId, 'tmp-1');
      expect(pending.isMine('u-1'), isTrue);
    });

    test('copyWith holatni oʻzgartiradi', () {
      final failed = ChatMessage.pending(
        conversationId: 'c-1',
        senderId: 'u-1',
        body: 'Test',
        clientMsgId: 'tmp-1',
      ).copyWith(status: MessageStatus.failed);

      expect(failed.status, MessageStatus.failed);
      expect(failed.body, 'Test');
      expect(failed.clientMsgId, 'tmp-1');
    });

    test('boʻsh javobdan ham obyekt quriladi', () {
      final message = ChatMessage.fromJson(const {});
      expect(message.id, '');
      expect(message.body, '');
    });
  });
}

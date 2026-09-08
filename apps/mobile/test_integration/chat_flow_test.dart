import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/core/ws/socket_client.dart';
import 'package:karvon/features/chat/data/chat_repository.dart';
import 'package:karvon/features/orders/data/orders_repository.dart';
import 'package:karvon/features/orders/domain/order.dart';

import 'support/memory_token_storage.dart';

/// Chat — HAQIQIY backend va HAQIQIY WebSocket bilan.
///
/// TEKSHIRILADI:
///   - suhbat taklif qabul qilinganda avtomatik ochiladi
///   - roʻyxatda qaysi reys ekani koʻrinadi
///   - `isMine` ikkala tomonda toʻgʻri hisoblanadi
///   - WebSocket orqali xabar bir tomondan ikkinchisiga yetib boradi
///   - bekor qilingan buyurtmada yozib boʻlmaydi, lekin oʻqish mumkin
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1 \
///     --dart-define=WS_URL=http://localhost:3000
void main() {
  final repoRoot = Directory.current.path.replaceAll(r'\', '/').replaceAll(
        RegExp(r'/apps/mobile/?$'),
        '',
      );

  Future<
      ({
        String orderId,
        String conversationId,
        String shipperToken,
        String driverToken,
        String shipperId,
        String driverId,
      })> fixture() async {
    final result = await Process.run(
      'node',
      ['scripts/order-fixture.js'],
      workingDirectory: repoRoot,
    );

    if (result.exitCode != 0) {
      fail('Buyurtma fixture yaratilmadi: ${result.stderr}');
    }

    final data = jsonDecode('${result.stdout}'.trim()) as Map<String, dynamic>;

    // Foydalanuvchi ID'si tokenning ichida (`sub`) — chat tomonini
    // aniqlash uchun kerak
    String subjectOf(String token) {
      final payload = token.split('.')[1];
      final normalized = base64Url.normalize(payload);
      final claims = jsonDecode(utf8.decode(base64Url.decode(normalized)))
          as Map<String, dynamic>;
      return claims['sub'] as String;
    }

    return (
      orderId: data['orderId'] as String,
      conversationId: data['conversationId'] as String,
      shipperToken: data['shipperToken'] as String,
      driverToken: data['driverToken'] as String,
      shipperId: subjectOf(data['shipperToken'] as String),
      driverId: subjectOf(data['driverToken'] as String),
    );
  }

  MemoryTokenStorage storageFor(String token) {
    final storage = MemoryTokenStorage()
      ..saveTokens(accessToken: token, refreshToken: token);
    return storage;
  }

  ChatRepository chatClient(String token) =>
      ChatRepository(ApiClient(storage: storageFor(token)));

  test('★ SUHBAT TAKLIF QABUL QILINGANDA OCHILADI', () async {
    final fx = await fixture();
    final driver = chatClient(fx.driverToken);

    final conversations = await driver.conversations();
    final conversation =
        conversations.firstWhere((item) => item.id == fx.conversationId);

    expect(conversation.canWrite, isTrue, reason: 'muloqot darhol boshlanadi');
    expect(conversation.orderId, fx.orderId);
    // Telefon hali yopiq — chat yagona yoʻl
    expect(conversation.unreadCount, 0);
  });

  test('★ ROʻYXATDA QAYSI REYS EKANI KOʻRINADI', () async {
    final fx = await fixture();
    final driver = chatClient(fx.driverToken);

    final conversation = (await driver.conversations())
        .firstWhere((item) => item.id == fx.conversationId);

    // Bir foydalanuvchi bilan bir nechta reys boʻlishi mumkin va
    // ismlar bir xil koʻrinadi
    expect(conversation.order, isNotNull);
    expect(conversation.order!.publicNo, isNotEmpty);
    expect(conversation.order!.loadTitle, isNotEmpty);
    expect(conversation.order!.route, contains('→'));
    expect(conversation.order!.status, OrderStatus.assigned);
  });

  test('★ isMine IKKALA TOMONDA TOʻGʻRI', () async {
    final fx = await fixture();
    final shipper = chatClient(fx.shipperToken);
    final driver = chatClient(fx.driverToken);

    await shipper.send(fx.conversationId, 'Qachon yetib borasiz?');

    final shipperView = await shipper.messages(fx.conversationId);
    final driverView = await driver.messages(fx.conversationId);

    final mine = shipperView.items.first;
    final theirs = driverView.items.first;

    expect(mine.body, 'Qachon yetib borasiz?');
    expect(mine.isMine(fx.shipperId), isTrue);
    // AYNAN SHU YERDA xato boʻlgan: qabul qiluvchi xabarni oʻzining
    // deb koʻrgan va u notoʻgʻri tomonda chizilgan
    expect(theirs.isMine(fx.driverId), isFalse);
    expect(theirs.senderId, fx.shipperId);
  });

  test('oʻqilmaganlar soni va oʻqilgan deb belgilash', () async {
    final fx = await fixture();
    final shipper = chatClient(fx.shipperToken);
    final driver = chatClient(fx.driverToken);

    await shipper.send(fx.conversationId, 'Birinchi');
    await shipper.send(fx.conversationId, 'Ikkinchi');

    var conversation = (await driver.conversations())
        .firstWhere((item) => item.id == fx.conversationId);
    expect(conversation.unreadCount, 2);
    expect(conversation.lastMessageBody, 'Ikkinchi');

    await driver.markRead(fx.conversationId);

    conversation = (await driver.conversations())
        .firstWhere((item) => item.id == fx.conversationId);
    expect(conversation.unreadCount, 0);
    expect(conversation.hasUnread, isFalse);

    // Yuboruvchida oʻqilmagan boʻlmaydi — oʻz xabari
    final ownView = (await shipper.conversations())
        .firstWhere((item) => item.id == fx.conversationId);
    expect(ownView.unreadCount, 0);
  });

  test('boʻsh xabar rad etiladi', () async {
    final fx = await fixture();

    await expectLater(
      chatClient(fx.shipperToken).send(fx.conversationId, '   '),
      throwsA(isA<ApiException>()),
    );
  });

  test('★ BEGONA SUHBATGA KIRIB BOʻLMAYDI', () async {
    final mine = await fixture();
    final other = await fixture();

    // Boshqa buyurtmaning suhbati — mavjudligi ham oshkor qilinmaydi
    await expectLater(
      chatClient(mine.driverToken).messages(other.conversationId),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'NOT_FOUND'),
      ),
    );
  });

  test('★ BEKOR QILINGAN BUYURTMADA YOZIB BOʻLMAYDI, OʻQISH MUMKIN', () async {
    final fx = await fixture();
    final shipper = chatClient(fx.shipperToken);

    await shipper.send(fx.conversationId, 'Reysdan oldingi xabar');

    final orders = OrdersRepository(ApiClient(storage: storageFor(fx.shipperToken)));
    await orders.changeStatus(
      fx.orderId,
      OrderStatus.cancelledByShipper,
      note: 'Rejalar oʻzgardi',
    );

    final conversation = (await shipper.conversations())
        .firstWhere((item) => item.id == fx.conversationId);
    expect(conversation.canWrite, isFalse);

    await expectLater(
      shipper.send(fx.conversationId, 'Yana bir xabar'),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'CHAT_CLOSED')),
    );

    // Tarix oʻchirilmaydi — nizoda dalil sifatida kerak
    final history = await shipper.messages(fx.conversationId);
    expect(history.items.first.body, 'Reysdan oldingi xabar');
  });

  test('★ WEBSOCKET: XABAR HAMKORGA YETIB BORADI', () async {
    final fx = await fixture();

    final shipperSocket = SocketClient(storageFor(fx.shipperToken));
    final driverSocket = SocketClient(storageFor(fx.driverToken));

    // Har ikkala tomon ulanishini kutamiz
    final shipperReady = shipperSocket.connectionState.firstWhere((up) => up);
    final driverReady = driverSocket.connectionState.firstWhere((up) => up);

    await shipperSocket.connect();
    await driverSocket.connect();
    await Future.wait([shipperReady, driverReady]).timeout(
      const Duration(seconds: 10),
      onTimeout: () => fail('WebSocket ulanmadi'),
    );

    shipperSocket.joinConversation(fx.conversationId);
    driverSocket.joinConversation(fx.conversationId);
    // Xonaga kirish serverga yetib borishi uchun kichik pauza
    await Future<void>.delayed(const Duration(milliseconds: 400));

    final received = driverSocket.messages.first;

    shipperSocket.sendMessage(
      conversationId: fx.conversationId,
      body: 'WebSocket orqali salom',
      clientMsgId: 'ws-test-1',
    );

    final message = await received.timeout(
      const Duration(seconds: 10),
      onTimeout: () => fail('Xabar hamkorga yetib bormadi'),
    );

    expect(message.body, 'WebSocket orqali salom');
    expect(message.conversationId, fx.conversationId);
    expect(message.senderId, fx.shipperId);
    // Qabul qiluvchi uchun bu OʻZINING xabari EMAS
    expect(message.isMine(fx.driverId), isFalse);

    await shipperSocket.dispose();
    await driverSocket.dispose();
  });
}

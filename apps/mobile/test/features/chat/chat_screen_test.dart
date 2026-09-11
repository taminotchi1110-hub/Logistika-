import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/providers.dart';
import 'package:karvon/core/theme/app_theme.dart';
import 'package:karvon/core/ws/socket_client.dart';
import 'package:karvon/core/ws/ws_providers.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/chat/data/chat_repository.dart';
import 'package:karvon/features/chat/domain/conversation.dart';
import 'package:karvon/features/chat/presentation/chat_providers.dart';
import 'package:karvon/features/chat/presentation/chat_screen.dart';
import 'package:mocktail/mocktail.dart';
import 'package:karvon/core/l10n/locale_controller.dart';

import '../../helpers/localized_app.dart';

class _MockChatRepository extends Mock implements ChatRepository {}

/// Soxta socket: haqiqiy ulanishsiz jonli xabarlarni taqlid qiladi.
class _FakeSocket implements SocketClient {
  final _messages = StreamController<RealtimeMessage>.broadcast();
  final joined = <String>[];
  final sent = <String>[];
  final readMarks = <String>[];

  bool connected = true;

  @override
  bool get isConnected => connected;

  @override
  Stream<RealtimeMessage> get messages => _messages.stream;

  void emit(RealtimeMessage message) => _messages.add(message);

  @override
  void joinConversation(String conversationId) => joined.add(conversationId);

  @override
  void leaveConversation(String conversationId) => joined.remove(conversationId);

  @override
  void markRead(String conversationId) => readMarks.add(conversationId);

  @override
  void sendMessage({
    required String conversationId,
    required String body,
    required String clientMsgId,
  }) {
    sent.add(body);
  }

  // --- ishlatilmaydigan qismlar ---
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

/// Chat ekrani.
///
/// ENG MUHIM TEKSHIRUV: xabar KIMNIKI ekani `senderId` bo'yicha
/// mijoz tomonida aniqlanadi. Backend'da bu xato bir marta yuz
/// bergan — qabul qiluvchi xabarni o'zining deb ko'rgan.
void main() {
  late _MockChatRepository repository;
  late _FakeSocket socket;

  const myId = 'me';
  const otherId = 'other';

  const me = AppUser(
    id: myId,
    phone: '+998901234567',
    firstName: 'Men',
    lastName: 'Test',
    role: UserRole.driver,
    status: UserStatus.active,
  );

  setUp(() {
    repository = _MockChatRepository();
    socket = _FakeSocket();
  });

  ChatMessage message(String id, String senderId, String body) => ChatMessage(
        id: id,
        conversationId: 'c-1',
        senderId: senderId,
        body: body,
        createdAt: DateTime.now(),
      );

  Future<void> pump(
    WidgetTester tester, {
    List<ChatMessage> history = const [],
    bool canWrite = true,
    AppLocale locale = testLocale,
  }) async {
    when(() => repository.messages('c-1', cursor: any(named: 'cursor'), limit: any(named: 'limit')))
        .thenAnswer(
      (_) async => MessagePage(items: history, nextCursor: null, hasMore: false),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          chatRepositoryProvider.overrideWithValue(repository),
          socketClientProvider.overrideWithValue(socket),
          currentUserProvider.overrideWithValue(me),
        ],
        child: localizedApp(
          theme: AppTheme.light,
          locale: locale,
          home: ChatScreen(
            conversationId: 'c-1',
            title: 'Anvar Karimov',
            subtitle: 'Toshkent → Samarqand',
            canWrite: canWrite,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('★ SUHBAT XONASIGA KIRADI VA OʻQILGAN DEB BELGILAYDI', (tester) async {
    await pump(tester);

    expect(socket.joined, contains('c-1'));
    expect(socket.readMarks, contains('c-1'));
  });

  testWidgets('tarix koʻrsatiladi', (tester) async {
    await pump(tester, history: [
      message('2', myId, 'Yoʻldaman'),
      message('1', otherId, 'Salom'),
    ]);

    expect(find.text('Salom'), findsOneWidget);
    expect(find.text('Yoʻldaman'), findsOneWidget);
  });

  testWidgets('boʻsh suhbatda tushuntirish koʻrsatiladi', (tester) async {
    await pump(tester);

    expect(find.textContaining('Hali xabar yoʻq'), findsOneWidget);
    // Foydalanuvchiga NEGA chat kerakligi aytiladi
    expect(find.textContaining('Telefon raqami'), findsOneWidget);
  });

  testWidgets('★ OPTIMISTIK YUBORISH: XABAR DARHOL ROʻYXATDA', (tester) async {
    await pump(tester);

    await tester.enterText(find.byType(TextField), 'Yetib keldim');
    await tester.pump();
    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pump();

    // Tarmoqni kutmaymiz — xabar darhol koʻrinadi
    expect(find.text('Yetib keldim'), findsOneWidget);
    expect(socket.sent, ['Yetib keldim']);
    // Maydon tozalandi
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, '');
  });

  testWidgets('boʻsh xabar yuborilmaydi', (tester) async {
    await pump(tester);

    final button = tester.widget<IconButton>(
      find.ancestor(
        of: find.byIcon(Icons.send_rounded),
        matching: find.byType(IconButton),
      ),
    );
    expect(button.onPressed, isNull);

    await tester.enterText(find.byType(TextField), '   ');
    await tester.pump();

    final stillDisabled = tester.widget<IconButton>(
      find.ancestor(
        of: find.byIcon(Icons.send_rounded),
        matching: find.byType(IconButton),
      ),
    );
    expect(stillDisabled.onPressed, isNull);
  });

  testWidgets('★ JONLI XABAR ROʻYXATGA QOʻSHILADI', (tester) async {
    await pump(tester);

    socket.emit(RealtimeMessage(
      id: '10',
      conversationId: 'c-1',
      senderId: otherId,
      body: 'Kutyapman',
      createdAt: DateTime.now(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Kutyapman'), findsOneWidget);
  });

  testWidgets('★ BOSHQA SUHBAT XABARI KOʻRSATILMAYDI', (tester) async {
    await pump(tester);

    socket.emit(RealtimeMessage(
      id: '11',
      conversationId: 'boshqa-suhbat',
      senderId: otherId,
      body: 'Notoʻgʻri suhbat',
      createdAt: DateTime.now(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Notoʻgʻri suhbat'), findsNothing);
  });

  testWidgets('★ TAKRORIY XABAR IKKI MARTA CHIZILMAYDI', (tester) async {
    // REST tarix va WebSocket bir xil xabarni berishi mumkin
    await pump(tester, history: [message('10', otherId, 'Kutyapman')]);

    socket.emit(RealtimeMessage(
      id: '10',
      conversationId: 'c-1',
      senderId: otherId,
      body: 'Kutyapman',
      createdAt: DateTime.now(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Kutyapman'), findsOneWidget);
  });

  testWidgets('★ ALOQA YOʻQLIGI AYTILADI', (tester) async {
    socket.connected = false;
    await pump(tester);

    // Aks holda foydalanuvchi "hamkor javob bermayapti" deb oʻylaydi
    expect(find.textContaining('Aloqa yoʻq'), findsOneWidget);
  });

  testWidgets('★ YOPILGAN SUHBATDA YOZIB BOʻLMAYDI', (tester) async {
    await pump(tester, canWrite: false, history: [message('1', otherId, 'Salom')]);

    expect(find.byType(TextField), findsNothing);
    expect(find.textContaining('yozib boʻlmaydi'), findsOneWidget);
    // Tarix oʻqiladi — nizoda dalil
    expect(find.text('Salom'), findsOneWidget);
  });

  testWidgets('★ EKRAN YOPILGANDA XONADAN CHIQADI', (tester) async {
    await pump(tester);
    expect(socket.joined, contains('c-1'));

    // Ekran almashtiriladi — `dispose()` chaqiriladi. Riverpod'da
    // `dispose()` ichida `ref` ishlamaydi va bu yerda tozalash umuman
    // bajarilmay qolgan edi: suhbat xonasi ochiq qolib, boshqa
    // ekranlarda ham xabar kelaverardi
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          chatRepositoryProvider.overrideWithValue(repository),
          socketClientProvider.overrideWithValue(socket),
          currentUserProvider.overrideWithValue(me),
        ],
        child: const MaterialApp(home: Scaffold(body: Text('Boshqa ekran'))),
      ),
    );
    await tester.pumpAndSettle();

    expect(socket.joined, isEmpty);
  });

  testWidgets('★ RUSCHA: BOʻSH SUHBAT VA MAYDON TARJIMA QILINGAN', (tester) async {
    await pump(tester, locale: AppLocale.ru);

    expect(find.text('Сообщений пока нет'), findsOneWidget);
    expect(find.text('Напишите сообщение…'), findsOneWidget);
    expect(find.textContaining('Hali xabar'), findsNothing);
  });
}

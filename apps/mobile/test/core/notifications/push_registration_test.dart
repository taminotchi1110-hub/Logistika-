import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/notifications/push_registration.dart';
import 'package:karvon/core/notifications/push_service.dart';

/// Soxta push manbai: Firebase platforma kanali testda yo'q.
class _FakePlatform implements PushPlatform {
  final _refreshes = StreamController<String>.broadcast();
  String? currentToken = 'token-1';
  var initializeCalls = 0;
  var deleteCalls = 0;

  /// FCM tokenni almashtirgandek.
  void refresh(String token) => _refreshes.add(token);

  Future<void> close() => _refreshes.close();

  @override
  Future<void> initialize() async => initializeCalls++;

  @override
  Future<String?> token() async => currentToken;

  @override
  Stream<String> get tokenRefresh => _refreshes.stream;

  @override
  Future<void> deleteToken() async => deleteCalls++;
}

/// Qurilmani push uchun ro'yxatdan o'tkazish.
///
/// Bu qism ilgari UMUMAN YO'Q edi: token serverga yuborilmasdi va push
/// hech qachon kelmasdi — xato hech bir testda ko'rinmagan.
void main() {
  late _FakePlatform platform;
  late List<String> sent;
  late PushRegistrar registrar;

  setUp(() {
    platform = _FakePlatform();
    sent = [];
    registrar = PushRegistrar(platform: platform, register: (token) async => sent.add(token));
  });

  tearDown(() async {
    await registrar.dispose();
    await platform.close();
  });

  test('★ KIRISHDA TOKEN SERVERGA YUBORILADI', () async {
    await registrar.onSignedIn();

    expect(sent, ['token-1']);
    expect(platform.initializeCalls, 1);
  });

  test('★ YANGILANGAN TOKEN HAM YUBORILADI', () async {
    await registrar.onSignedIn();

    // FCM tokenni almashtirdi — eskisiga ketgan push yo'qolardi
    platform.refresh('token-2');
    await Future<void>.delayed(Duration.zero);

    expect(sent, ['token-1', 'token-2']);
  });

  test('bir xil token qayta yuborilmaydi', () async {
    await registrar.onSignedIn();
    await registrar.onSignedIn();
    platform.refresh('token-1');
    await Future<void>.delayed(Duration.zero);

    expect(sent, ['token-1']);
    // Kanal va ruxsat so'rovi bir marta
    expect(platform.initializeCalls, 1);
  });

  test('★ CHIQISHDA TOKEN OʻCHIRILADI, QAYTA KIRISHDA YANA YUBORILADI', () async {
    await registrar.onSignedIn();
    await registrar.onSignedOut();

    // Shu telefonda boshqa odam kirsa oldingi foydalanuvchining
    // bildirishnomalari unga kelmasligi kerak
    expect(platform.deleteCalls, 1);

    platform.currentToken = 'token-3';
    await registrar.onSignedIn();
    expect(sent, ['token-1', 'token-3']);
  });

  test('chiqqandan keyin eski yangilanish tinglanmaydi', () async {
    await registrar.onSignedIn();
    await registrar.onSignedOut();

    platform.refresh('token-9');
    await Future<void>.delayed(Duration.zero);

    expect(sent, ['token-1']);
  });

  test('★ SERVER XATOSI KIRISHNI BUZMAYDI VA KEYIN QAYTA URINILADI', () async {
    var fail = true;
    registrar = PushRegistrar(
      platform: platform,
      register: (token) async {
        if (fail) throw Exception('tarmoq');
        sent.add(token);
      },
    );

    // Xato tashqariga chiqmaydi — push qo'shimcha kanal
    await registrar.onSignedIn();
    expect(sent, isEmpty);

    // Token "yuborilgan" deb belgilanmagan: keyingi urinishda ketadi
    fail = false;
    await registrar.onSignedIn();
    expect(sent, ['token-1']);
  });

  test('token boʻlmasa (ruxsat berilmagan) — soʻrov yoʻq', () async {
    platform.currentToken = null;
    await registrar.onSignedIn();
    expect(sent, isEmpty);
  });

  group('ilova ochiq paytdagi push → banner', () {
    test('★ BUYURTMA XABARI', () {
      final notification = notificationFromPush(
        const RemoteMessage(
          data: {'type': 'order.status', 'deepLink': 'karvon://order/o-1', 'status': 'LOADED'},
          notification: RemoteNotification(title: 'Yuk ortildi', body: 'Buyurtma holati yangilandi'),
        ),
      );

      expect(notification.title, 'Yuk ortildi');
      expect(notification.deepLink, 'karvon://order/o-1');
      expect(notification.channel, PushService.ordersChannelId);
      expect(notification.isChat, isFalse);
    });

    test('chat xabari — xabarlar kanali, suhbat identifikatori saqlanadi', () {
      final notification = notificationFromPush(
        const RemoteMessage(
          data: {'type': 'chat.message', 'deepLink': '', 'conversationId': 'c-1'},
          notification: RemoteNotification(title: 'Anvar', body: 'Yetib keldim'),
        ),
      );

      expect(notification.isChat, isTrue);
      expect(notification.channel, PushService.messagesChannelId);
      expect(notification.conversationId, 'c-1');
      // Boʻsh havola — "havola yoʻq" (bosilganda hech qayerga olib bormaydi)
      expect(notification.deepLink, isNull);
    });
  });
}

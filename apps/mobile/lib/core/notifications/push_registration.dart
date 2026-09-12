import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:karvon/l10n/app_localizations.dart';

import '../l10n/locale_controller.dart';
import '../providers.dart';
import '../ws/socket_client.dart';
import 'push_service.dart';

/// Firebase sozlanganmi (`google-services.json` / `GoogleService-Info.plist`).
///
/// `main()` da bir marta aniqlanadi va shu yerga beriladi. Sozlanmagan
/// yig'ishda (lokal ishlab chiqish, CI) push o'chiq — ilova qolgan hamma
/// narsada to'liq ishlaydi.
final pushAvailableProvider = Provider<bool>((ref) => false);

/// Firebase'ni ishga tushiradi. Konfiguratsiya fayli yo'q bo'lsa `false`.
Future<bool> initializeFirebase() async {
  try {
    await Firebase.initializeApp();
    return true;
  } on Object catch (error) {
    debugPrint("Push o'chiq — Firebase sozlanmagan: $error");
    return false;
  }
}

final pushServiceProvider = Provider<PushService>((ref) {
  return PushService(
    // Kanal nomlari tizim sozlamalarida ko'rinadi — joriy tilda
    localizations: () => lookupAppLocalizations(ref.read(localeControllerProvider).locale),
  );
});

/// Qurilmani push uchun ro'yxatdan o'tkazish.
///
/// ILGARI BU UMUMAN YO'Q EDI: `PushService` yozilgan, backend push
/// yuborishga tayyor, lekin ilova tokenni serverga yubormasdi — push
/// hech qachon kelmasdi. Server faqat `PUT /me/devices` orqali olingan
/// tokenlarga yuboradi.
///
/// Xatolar YUTILADI: push — qo'shimcha kanal. Token yuborilmasa
/// foydalanuvchi baribir ilovada ishlaydi (realtime banner ishlaydi),
/// keyingi kirishda yoki token yangilanganda qayta uriniladi.
class PushRegistrar {
  PushRegistrar({
    required PushPlatform platform,
    required Future<void> Function(String token) register,
  })  : _platform = platform,
        _register = register;

  final PushPlatform _platform;
  final Future<void> Function(String token) _register;

  StreamSubscription<String>? _refresh;
  String? _registeredToken;
  var _initialized = false;

  /// Foydalanuvchi tizimga to'liq kirdi.
  Future<void> onSignedIn() async {
    try {
      if (!_initialized) {
        await _platform.initialize();
        _initialized = true;
      }

      final token = await _platform.token();
      if (token != null) await _send(token);

      // FCM tokenni vaqti-vaqti bilan almashtiradi: eskisiga yuborilgan
      // push jimgina yo'qoladi
      _refresh ??= _platform.tokenRefresh.listen(_send);
    } on Object catch (error) {
      debugPrint('Push ro‘yxatdan o‘tmadi: $error');
    }
  }

  /// Foydalanuvchi chiqdi.
  ///
  /// Token O'CHIRILADI: aks holda shu telefonda boshqa odam kirsa,
  /// oldingi foydalanuvchining bildirishnomalari unga kelardi.
  Future<void> onSignedOut() async {
    await _refresh?.cancel();
    _refresh = null;
    _registeredToken = null;

    try {
      await _platform.deleteToken();
    } on Object catch (error) {
      debugPrint('Push tokeni o‘chirilmadi: $error');
    }
  }

  Future<void> _send(String token) async {
    // Bir xil tokenni qayta-qayta yubormaymiz (har holat o'zgarishida)
    if (token == _registeredToken) return;
    try {
      await _register(token);
      _registeredToken = token;
    } on Object catch (error) {
      debugPrint('Push tokeni serverga yetmadi: $error');
    }
  }

  Future<void> dispose() async {
    await _refresh?.cancel();
    _refresh = null;
  }
}

/// Kirish holatiga qarab qurilmani ro'yxatdan o'tkazadi yoki o'chiradi.
///
/// Ilova ildizida (`KarvonApp`) `watch` qilinadi.
final pushRegistrationProvider = Provider<void>((ref) {
  if (!ref.watch(pushAvailableProvider)) return;

  final registrar = PushRegistrar(
    platform: ref.watch(pushServiceProvider),
    register: (token) => ref.read(authRepositoryProvider).registerPushToken(token),
  );
  ref.onDispose(registrar.dispose);

  ref.listen<AuthState>(
    authStateProvider,
    (previous, next) {
      final wasIn = previous?.status == AuthStatus.authenticated;
      final isIn = next.status == AuthStatus.authenticated;
      if (isIn && !wasIn) unawaited(registrar.onSignedIn());
      if (wasIn && !isIn) unawaited(registrar.onSignedOut());
    },
    fireImmediately: true,
  );
});

/// Ilova OCHIQ paytida kelgan push — WebSocket banneri bilan bir xil
/// ko'rinishda.
///
/// Server foydalanuvchi ulanmagan deb hisoblasa push yuboradi. Ilova
/// ayni damda ochilgan yoki ulanish tiklanayotgan bo'lsa, push oldinga
/// o'tib keladi — uni tizim bildirishnomasi emas, banner qilib
/// ko'rsatamiz.
RealtimeNotification notificationFromPush(RemoteMessage message) {
  final data = message.data;
  final type = data['type'] as String? ?? '';
  final link = data['deepLink'] as String?;

  return RealtimeNotification(
    type: type,
    title: message.notification?.title ?? '',
    body: message.notification?.body ?? '',
    deepLink: (link == null || link.isEmpty) ? null : link,
    entityId: data['entityId'] as String?,
    // Kanal FCM `data` da yo'q (u `android.notification` da) — turdan
    channel: type == 'chat.message' ? PushService.messagesChannelId : PushService.ordersChannelId,
    data: Map<String, dynamic>.from(data),
  );
}

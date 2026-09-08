import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Push bildirishnomalar.
///
/// ENG MUHIM TAFSILOT — ANDROID KANALI:
///
/// Bildirishnoma ekran yuqorisidan "sirg'alib chiqishi" (heads-up)
/// uchun kanal `Importance.high` bilan yaratilgan bo'lishi SHART.
/// Serverdan yuborilgan `priority: high` yolg'iz o'zi yetarli emas:
/// kanal muhimligi past bo'lsa, bildirishnoma jimgina "pardaga"
/// tushadi va foydalanuvchi uni ko'rmaydi.
///
/// Kanal ilova birinchi ishga tushganda BIR MARTA yaratiladi va
/// keyin O'ZGARTIRIB BO'LMAYDI (Android cheklovi). Ya'ni bu yerda
/// xato qilinsa, uni tuzatish uchun foydalanuvchi ilovani o'chirib
/// qayta o'rnatishi kerak bo'ladi. Shuning uchun kanal parametrlari
/// backend bilan aniq moslashtirilgan: `karvon_messages` va
/// `karvon_orders` (docs/15 §15.5).
class PushService {
  PushService();

  final _local = FlutterLocalNotificationsPlugin();
  final _firebase = FirebaseMessaging.instance;

  /// Chat xabarlari kanali — eng yuqori muhimlik.
  static const _messagesChannel = AndroidNotificationChannel(
    'karvon_messages',
    'Xabarlar',
    description: 'Yuk beruvchi va haydovchi oʻrtasidagi xabarlar',
    importance: Importance.high,
    enableVibration: true,
    playSound: true,
  );

  /// Buyurtma va to'lov bildirishnomalari.
  static const _ordersChannel = AndroidNotificationChannel(
    'karvon_orders',
    'Buyurtmalar',
    description: 'Yangi yuklar, takliflar va buyurtma holati',
    importance: Importance.high,
    enableVibration: true,
    playSound: true,
  );

  /// Foydalanuvchi bildirishnomani bosganda chaqiriladi.
  void Function(String deepLink)? onNotificationTap;

  /// Ilova ochiq bo'lganda kelgan xabar — banner ko'rsatiladi.
  void Function(RemoteMessage message)? onForegroundMessage;

  Future<void> initialize() async {
    await _createChannels();
    await _initializeLocal();
    await _requestPermission();
    _listen();
  }

  Future<void> _createChannels() async {
    if (!Platform.isAndroid) return;

    final android = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();

    await android?.createNotificationChannel(_messagesChannel);
    await android?.createNotificationChannel(_ordersChannel);
  }

  Future<void> _initializeLocal() async {
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(
        // So'rov alohida chaqiriladi (`_requestPermission`) — ilova
        // ochilishi bilan emas, foydalanuvchi kontekstni tushunganda
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );

    await _local.initialize(
      settings,
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload != null && payload.isNotEmpty) {
          onNotificationTap?.call(payload);
        }
      },
    );
  }

  /// Ruxsat so'rash.
  ///
  /// Android 13+ da bu majburiy. iOS'da ham. Rad etilsa ilova
  /// ishlashda davom etadi — faqat push kelmaydi.
  Future<bool> _requestPermission() async {
    final settings = await _firebase.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      // `provisional` — iOS'da so'ramasdan "jim" bildirishnoma yuborish.
      // Ishlatmaymiz: logistikada bildirishnoma ko'rinishi kerak.
      provisional: false,
    );

    return settings.authorizationStatus == AuthorizationStatus.authorized;
  }

  void _listen() {
    // Ilova OCHIQ bo'lganda: tizim bildirishnomasi ko'rsatilmaydi,
    // biz o'zimiz banner chizamiz
    FirebaseMessaging.onMessage.listen((message) {
      onForegroundMessage?.call(message);
    });

    // Ilova FONDA turganda foydalanuvchi bildirishnomani bosdi
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      final link = message.data['deepLink'] as String?;
      if (link != null && link.isNotEmpty) onNotificationTap?.call(link);
    });
  }

  /// Ilova YOPIQ bo'lganda bosilgan bildirishnoma.
  ///
  /// Bu `initialize()` dan alohida: ilova ishga tushishi bilan
  /// tekshiriladi va router tayyor bo'lgandan keyin qo'llanadi.
  Future<String?> initialDeepLink() async {
    final message = await _firebase.getInitialMessage();
    final link = message?.data['deepLink'] as String?;
    return (link != null && link.isNotEmpty) ? link : null;
  }

  /// FCM tokeni — backend'ga yuboriladi (`PUT /me/devices`).
  Future<String?> token() => _firebase.getToken();

  /// Token yangilanganda backend'ga qayta yuborish kerak.
  Stream<String> get tokenRefresh => _firebase.onTokenRefresh;

  /// Chiqishda: token o'chiriladi, aks holda boshqa foydalanuvchining
  /// bildirishnomalari shu qurilmaga kelishi mumkin.
  Future<void> deleteToken() => _firebase.deleteToken();
}

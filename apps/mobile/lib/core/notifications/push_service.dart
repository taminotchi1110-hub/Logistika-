import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:karvon/l10n/app_localizations.dart';

/// Push manbai — `PushRegistrar` shu orqali ishlaydi.
///
/// Interfeys testlar uchun: testda Firebase platforma kanali yo'q va
/// haqiqiy `FirebaseMessaging` ishga tushmaydi.
abstract interface class PushPlatform {
  /// Kanallar, ruxsat so'rovi va tinglovchilar.
  Future<void> initialize();

  Future<String?> token();

  Stream<String> get tokenRefresh;

  Future<void> deleteToken();
}

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
/// Kanal MUHIMLIGI birinchi yaratilgandan keyin O'ZGARTIRIB BO'LMAYDI
/// (Android cheklovi) — xato qilinsa foydalanuvchi ilovani qayta
/// o'rnatishi kerak bo'ladi. Nomi va tavsifi esa har yaratishda
/// yangilanadi, shuning uchun ular joriy tilda beriladi. Kanal
/// identifikatorlari backend bilan aniq mos: `karvon_messages` va
/// `karvon_orders` (docs/15 §15.5).
class PushService implements PushPlatform {
  PushService({required AppLocalizations Function() localizations})
      : _localizations = localizations;

  final AppLocalizations Function() _localizations;
  final _local = FlutterLocalNotificationsPlugin();

  /// `late`: Firebase ishga tushirilmagan bo'lsa `instance` xato
  /// tashlaydi — obyekt yaratilganda emas, birinchi ishlatilganda
  /// murojaat qilamiz.
  late final FirebaseMessaging _firebase = FirebaseMessaging.instance;

  static const messagesChannelId = 'karvon_messages';
  static const ordersChannelId = 'karvon_orders';

  /// Foydalanuvchi bildirishnomani bosganda chaqiriladi.
  void Function(String deepLink)? onNotificationTap;

  /// Ilova ochiq bo'lganda kelgan xabar — banner ko'rsatiladi.
  void Function(RemoteMessage message)? onForegroundMessage;

  var _listening = false;

  @override
  Future<void> initialize() async {
    await _createChannels();
    await _initializeLocal();
    await _requestPermission();
    _listen();
  }

  Future<void> _createChannels() async {
    if (!Platform.isAndroid) return;

    final l10n = _localizations();
    final android = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();

    // Chat xabarlari — eng yuqori muhimlik
    await android?.createNotificationChannel(
      AndroidNotificationChannel(
        messagesChannelId,
        l10n.pushChannelMessages,
        description: l10n.pushChannelMessagesHint,
        importance: Importance.high,
        enableVibration: true,
        playSound: true,
      ),
    );
    // Buyurtma, taklif va to'lov bildirishnomalari
    await android?.createNotificationChannel(
      AndroidNotificationChannel(
        ordersChannelId,
        l10n.pushChannelOrders,
        description: l10n.pushChannelOrdersHint,
        importance: Importance.high,
        enableVibration: true,
        playSound: true,
      ),
    );
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
    // Qayta kirishda ikkinchi marta obuna bo'lmaslik: aks holda har
    // bir xabar ikki marta banner bo'lib chiqardi
    if (_listening) return;
    _listening = true;

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
  @override
  Future<String?> token() => _firebase.getToken();

  /// Token yangilanganda backend'ga qayta yuborish kerak.
  @override
  Stream<String> get tokenRefresh => _firebase.onTokenRefresh;

  /// Chiqishda: token o'chiriladi, aks holda boshqa foydalanuvchining
  /// bildirishnomalari shu qurilmaga kelishi mumkin.
  @override
  Future<void> deleteToken() => _firebase.deleteToken();
}

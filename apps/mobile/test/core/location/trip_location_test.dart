import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:karvon/core/location/trip_location.dart';

/// Reys davomidagi joylashuv sozlamasi.
///
/// BU FAYL SHUNING UCHUN BOR: sozlamadagi bitta bayroq yoʻqolsa, kuzatuv
/// ekran qulflanganda jimgina toʻxtaydi. Kod kompilyatsiya boʻladi,
/// testlar oʻtadi, lekin mijoz haydovchini xaritada "muzlagan" holda
/// koʻradi — buni faqat haqiqiy reysda sezish mumkin.
void main() {
  const notification = TripNotificationText(
    title: 'Reys kuzatuvda',
    body: 'Mijoz yuk qayerdaligini koʻradi',
  );
  const interval = Duration(seconds: 10);

  LocationSettings build({required bool isAndroid, required bool isIOS}) =>
      tripLocationSettings(
        interval: interval,
        notification: notification,
        isAndroid: isAndroid,
        isIOS: isIOS,
      );

  test('★ ANDROID: FON XIZMATI YOQILGAN', () {
    final settings = build(isAndroid: true, isIOS: false);

    expect(settings, isA<AndroidSettings>());
    final config = (settings as AndroidSettings).foregroundNotificationConfig;

    // Busiz oqim ilova fonga oʻtgach bir necha daqiqada oʻladi
    expect(config, isNotNull);
    expect(config!.notificationTitle, 'Reys kuzatuvda');
    // Surib yuborib boʻlmaydi — kuzatuv ketayotgani doim koʻrinadi
    expect(config.setOngoing, isTrue);
    // Uyqu rejimida ham nuqta yuborilsin
    expect(config.enableWakeLock, isTrue);
    expect(settings.intervalDuration, interval);
  });

  test('★ iOS: FONDA YANGILANISH YOQILGAN VA TIZIM UNI TOʻXTATMAYDI', () {
    final settings = build(isAndroid: false, isIOS: true);

    expect(settings, isA<AppleSettings>());
    final apple = settings as AppleSettings;

    // `Info.plist` dagi `UIBackgroundModes: location` bilan birga ishlaydi
    expect(apple.allowBackgroundLocationUpdates, isTrue);
    // Tizim uzoq turgan mashinada yangilanishni oʻzi toʻxtatib qoʻyardi
    expect(apple.pauseLocationUpdatesAutomatically, isFalse);
    // Koʻk indikator — foydalanuvchi uchun ochiqlik
    expect(apple.showBackgroundLocationIndicator, isTrue);
    expect(apple.activityType, ActivityType.automotiveNavigation);
  });

  test('boshqa platformada oddiy sozlama', () {
    final settings = build(isAndroid: false, isIOS: false);

    expect(settings.accuracy, LocationAccuracy.high);
    expect(settings, isNot(isA<AndroidSettings>()));
    expect(settings, isNot(isA<AppleSettings>()));
  });
}

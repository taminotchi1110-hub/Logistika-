import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import 'device_location.dart';

/// Android fon xizmatining doimiy bildirishnomasi matni.
///
/// Tizim talabi: fonda joylashuv olayotgan ilova buni YASHIRA OLMAYDI.
/// Bu foydalanuvchiga ham halol: kuzatuv ketayotgani ko'rinib turadi va
/// u bildirishnomani bosib ilovaga qaytishi mumkin.
class TripNotificationText {
  const TripNotificationText({required this.title, required this.body});

  final String title;
  final String body;
}

/// Reys davomidagi joylashuv oqimi.
///
/// Funksiya sifatida — testda soxta oqim beriladi: platforma kanali
/// testda yo'q va haqiqiy `Geolocator` chaqiruvi javob qaytarmay osilib
/// qolardi.
typedef TripLocationStream =
    Stream<DeviceLocation> Function({
      required Duration interval,
      required TripNotificationText notification,
    });

/// Qurilmaning haqiqiy oqimi.
Stream<DeviceLocation> deviceTripLocationStream({
  required Duration interval,
  required TripNotificationText notification,
}) {
  return Geolocator.getPositionStream(
    locationSettings: tripLocationSettings(
      interval: interval,
      notification: notification,
      isAndroid: Platform.isAndroid,
      isIOS: Platform.isIOS,
    ),
  ).map(
    (position) => DeviceLocation(
      lat: position.latitude,
      lng: position.longitude,
      accuracyM: position.accuracy,
    ),
  );
}

/// 25 metr — shahar ichida ortiqcha nuqta bermaydi, lekin burilishni
/// yo'qotmaydi. Interval bilan birga ishlaydi: qaysi biri oldin bo'lsa.
const _distanceFilterM = 25;

/// Platformaga mos sozlama.
///
/// ENG MUHIM QISM — EKRAN QULFLANGANDA HAM ISHLASHI:
///
///   Android — `foregroundNotificationConfig`: geolocator fon xizmatini
///   (foreground service) ishga tushiradi. Usiz Dart taymeri ham, oqim ham
///   ilova fonga o'tgach bir necha daqiqada to'xtaydi va mijoz haydovchini
///   xaritada "muzlagan" holda ko'radi. `ACCESS_BACKGROUND_LOCATION`
///   ruxsati KERAK EMAS: xizmat ilova ochiq paytda boshlanadi (haydovchi
///   "Yo'lga chiqdim" tugmasini bosganda) — Play Console'dagi og'ir
///   "fon joylashuvi" deklaratsiyasi ham shu sababli talab qilinmaydi.
///
///   iOS — `allowBackgroundLocationUpdates`: `UIBackgroundModes: location`
///   bilan birga ishlaydi (`Info.plist`). `pauseLocationUpdatesAutomatically`
///   o'chirilgan: tizim uzoq turgan mashinada yangilanishni o'zi to'xtatib
///   qo'yardi va yo'lga chiqqanda darhol tiklamasdi. Ko'k indikator
///   (`showBackgroundLocationIndicator`) — foydalanuvchi uchun ochiqlik.
///
/// `isAndroid` / `isIOS` parametr sifatida: testda platformani almashtirib
/// bo'lmaydi, sozlama esa jimgina buzilsa kuzatuv butunlay yo'qoladi.
LocationSettings tripLocationSettings({
  required Duration interval,
  required TripNotificationText notification,
  required bool isAndroid,
  required bool isIOS,
}) {
  if (isAndroid) {
    return AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: _distanceFilterM,
      intervalDuration: interval,
      foregroundNotificationConfig: ForegroundNotificationConfig(
        notificationTitle: notification.title,
        notificationText: notification.body,
        // Monoxrom belgi — bildirishnoma ikonkasi oq siluet bo'lishi kerak
        notificationIcon: const AndroidResource(
          name: 'ic_launcher_monochrome',
          defType: 'drawable',
        ),
        // Uyqu rejimida ham nuqta yuborilsin
        enableWakeLock: true,
        // Surib yuborib bo'lmaydi: kuzatuv ketayotgani doim ko'rinadi
        setOngoing: true,
      ),
    );
  }

  if (isIOS) {
    return AppleSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: _distanceFilterM,
      // Avtomobil harakati — tizim filtrlarni shunga moslaydi
      activityType: ActivityType.automotiveNavigation,
      pauseLocationUpdatesAutomatically: false,
      showBackgroundLocationIndicator: true,
      allowBackgroundLocationUpdates: true,
    );
  }

  return const LocationSettings(
    accuracy: LocationAccuracy.high,
    distanceFilter: _distanceFilterM,
  );
}

final tripLocationStreamProvider = Provider<TripLocationStream>(
  (ref) => deviceTripLocationStream,
);

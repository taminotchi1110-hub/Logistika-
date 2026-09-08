import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

/// Qurilmaning joriy nuqtasi.
class DeviceLocation {
  const DeviceLocation({required this.lat, required this.lng, this.accuracyM});

  final double lat;
  final double lng;
  final double? accuracyM;
}

typedef LocationResolver = Future<DeviceLocation?> Function();

/// Joylashuv manbai.
///
/// NEGA PROVAYDER ORQALI (to'g'ridan-to'g'ri `Geolocator` emas):
///   1. Testda platforma kanali yo'q va `Geolocator` chaqiruvi
///      JAVOB QAYTARMAY OSILIB QOLADI — ekran abadiy "yuklanmoqda"
///      holatida qoladi va buni sezish qiyin.
///   2. Joylashuv bir necha ekranda kerak (status o'zgartirish, manzil
///      tanlash, kuzatuv). Qoida bitta joyda bo'lsa, ruxsat mantiqi ham
///      bitta joyda bo'ladi.
final locationResolverProvider =
    Provider<LocationResolver>((ref) => resolveDeviceLocation);

/// UMUMIY MUDDAT — 10 soniya.
///
/// `getCurrentPosition` ning o'z `timeLimit` i yetarli emas: undan
/// oldingi `isLocationServiceEnabled` va `checkPermission` chaqiruvlari
/// ham javobsiz qolishi mumkin (emulyator, buzilgan servis, web).
/// Muddat butun zanjirga qo'yiladi.
const _overallTimeout = Duration(seconds: 10);

/// Joylashuvni aniqlaydi. Aniqlab bo'lmasa `null` — XATO EMAS.
///
/// Reys GPS tufayli to'xtab qolmasligi kerak: koordinata foydali
/// qo'shimcha (nizoda dalil), lekin majburiy shart emas.
Future<DeviceLocation?> resolveDeviceLocation() async {
  try {
    return await _resolve().timeout(_overallTimeout);
  } on Object {
    return null;
  }
}

Future<DeviceLocation?> _resolve() async {
  if (!await Geolocator.isLocationServiceEnabled()) return null;

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  // `deniedForever` — qayta so'rash foydasiz, foydalanuvchi tizim
  // sozlamalaridan yoqishi kerak
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    return null;
  }

  final position = await Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      timeLimit: Duration(seconds: 8),
    ),
  );

  return DeviceLocation(
    lat: position.latitude,
    lng: position.longitude,
    accuracyM: position.accuracy,
  );
}

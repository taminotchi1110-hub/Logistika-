/// Ilova sozlamalari.
///
/// Qiymatlar `--dart-define` orqali beriladi:
///
///   flutter run --dart-define=API_BASE_URL=https://api.karvon.uz/v1
///
/// NEGA .env FAYLI EMAS: `.env` ilova paketiga qo'shiladi va uni
/// APK'dan chiqarib olish oson. `--dart-define` esa kompilyatsiya
/// paytida kodga kiritiladi. Baribir maxfiy kalit MOBIL ILOVADA
/// SAQLANMAYDI — u har doim ochiq deb hisoblanadi.
abstract final class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    // Android emulyatorda 10.0.2.2 — bu xost mashinaning localhost'i
    defaultValue: 'http://10.0.2.2:3000/v1',
  );

  static const wsUrl = String.fromEnvironment(
    'WS_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  static const environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'development',
  );

  static bool get isDevelopment => environment == 'development';
  static bool get isProduction => environment == 'production';

  /// Qo'llab-quvvatlash telefoni, E.164: `+998XXXXXXXXX`.
  ///
  /// NEGA STANDART QIYMAT YO'Q: to'qima raqam bilan chiqqan ilovada
  /// bloklangan foydalanuvchi begona odamga qo'ng'iroq qiladi. Raqam
  /// berilmasa tugma ko'rsatilmaydi; reliz yig'ishda `scripts/build-
  /// mobile-release.sh` bu qiymatni majburiy tekshiradi.
  static const supportPhone = String.fromEnvironment('SUPPORT_PHONE');

  static bool get hasSupportPhone => supportPhone.isNotEmpty;

  /// Xarita plitkalari — OpenStreetMap.
  ///
  /// Ishlab chiqarishda o'z tile serverimiz bo'ladi: OSM ning ochiq
  /// serveri tijorat yuklamasiga ruxsat bermaydi (foydalanish shartlari).
  static const mapTileUrl = String.fromEnvironment(
    'MAP_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  /// Xarita atributsiyasi — OSM litsenziyasi talabi.
  static const mapAttribution = '© OpenStreetMap';

  /// Faol reysda GPS yuborish intervali (soniya).
  /// Backend sozlamasi bilan mos: `tracking.interval_sec`.
  static const trackingIntervalSeconds = 10;

  /// Bo'sh haydovchi uchun past chastotali yangilash (matching keshi).
  static const idleLocationIntervalSeconds = 120;
}

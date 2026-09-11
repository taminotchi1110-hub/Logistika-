import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Ilova tili.
///
/// UCHTA TIL: o'zbek, rus, ingliz (`docs/11-roadmap.md` talabi).
/// Ingliz tili O'zbekistonda kam ishlatiladi, lekin u xalqaro
/// yo'nalishlar (KZ/RU) va tashqi hamkorlar uchun zaxira — ustiga
/// store sahifasi ham inglizcha bo'ladi.
enum AppLocale {
  uz('uz'),
  ru('ru'),
  en('en');

  const AppLocale(this.code);

  final String code;

  Locale get locale => Locale(code);

  static AppLocale fromCode(String? code) =>
      AppLocale.values.firstWhere((value) => value.code == code, orElse: () => AppLocale.uz);

  /// Tizim tilidan mos tilni tanlaydi.
  ///
  /// STANDART — O'ZBEK, ingliz emas. Platforma O'zbekistonda ishlaydi
  /// va foydalanuvchilarning aksariyati o'zbek tilida. Qurilma tili
  /// noma'lum bo'lsa, inglizchaga tushib qolish ularni begona
  /// interfeysga olib borardi.
  static AppLocale fromSystem(Locale system) => switch (system.languageCode) {
        'ru' => AppLocale.ru,
        'en' => AppLocale.en,
        _ => AppLocale.uz,
      };
}

/// Tanlangan tilni saqlaydi.
///
/// `SharedPreferences`, `flutter_secure_storage` EMAS: til maxfiy
/// ma'lumot emas va uni shifrlashning ma'nosi yo'q. Xavfsiz xotira
/// sekinroq va Android'da Keystore'ga murojaat qiladi — ilova
/// ishga tushishida bu keraksiz kechikish.
class LocaleStorage {
  static const _key = 'app_locale';

  Future<AppLocale?> read() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_key);
    // `null` — foydalanuvchi hali tanlamagan. Bu "o'zbekcha tanlagan"
    // dan FARQ QILADI: birinchi holatda tizim tili qo'llanadi
    return code == null ? null : AppLocale.fromCode(code);
  }

  Future<void> write(AppLocale locale) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, locale.code);
  }
}

final localeStorageProvider = Provider<LocaleStorage>((ref) => LocaleStorage());

/// Joriy til.
///
/// Boshlang'ich qiymat TIZIM TILIDAN olinadi va saqlangan tanlov
/// yuklangach almashtiriladi. Aks holda ilova bir zum o'zbekcha
/// ko'rinib, keyin ruschaga o'tardi — bu "miltillash" sezilarli.
class LocaleController extends StateNotifier<AppLocale> {
  LocaleController(this._storage, AppLocale initial) : super(initial) {
    _restore();
  }

  final LocaleStorage _storage;

  Future<void> _restore() async {
    final saved = await _storage.read();
    if (saved != null && saved != state) state = saved;
  }

  Future<void> change(AppLocale locale) async {
    if (locale == state) return;
    state = locale;
    // Saqlash FONDA: interfeys darhol o'zgaradi, disk yozuvini
    // kutib turishning ma'nosi yo'q
    await _storage.write(locale);
  }
}

final localeControllerProvider = StateNotifierProvider<LocaleController, AppLocale>((ref) {
  final system = PlatformDispatcher.instance.locale;
  return LocaleController(ref.watch(localeStorageProvider), AppLocale.fromSystem(system));
});

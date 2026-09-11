import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Til tanlovi.
///
/// XATO QIMMAT: noto'g'ri til bilan ochilgan ilova foydalanuvchi
/// o'qiy olmaydigan interfeys demak, va u tilni qayerdan
/// almashtirishni bilmasligi mumkin.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('AppLocale', () {
    test('★ NOMAʼLUM TIZIM TILIDA OʻZBEKCHA TANLANADI', () {
      // Standart INGLIZCHA EMAS: platforma Oʻzbekistonda ishlaydi va
      // foydalanuvchilarning aksariyati oʻzbek tilida. Inglizchaga
      // tushib qolish ularni begona interfeysga olib borardi
      expect(AppLocale.fromSystem(const Locale('de')), AppLocale.uz);
      expect(AppLocale.fromSystem(const Locale('tr')), AppLocale.uz);
      expect(AppLocale.fromSystem(const Locale('uz')), AppLocale.uz);
    });

    test('rus va ingliz tizim tili tanib olinadi', () {
      expect(AppLocale.fromSystem(const Locale('ru')), AppLocale.ru);
      expect(AppLocale.fromSystem(const Locale('en')), AppLocale.en);
      // Mintaqa bilan ham: `ru_RU`, `en_US`
      expect(AppLocale.fromSystem(const Locale('ru', 'RU')), AppLocale.ru);
      expect(AppLocale.fromSystem(const Locale('en', 'US')), AppLocale.en);
    });

    test('★ BUZUQ KOD ILOVANI YIQITMAYDI', () {
      // Saqlangan qiymat qoʻlda oʻzgartirilishi yoki eski versiyadan
      // qolishi mumkin
      expect(AppLocale.fromCode('xx'), AppLocale.uz);
      expect(AppLocale.fromCode(null), AppLocale.uz);
      expect(AppLocale.fromCode(''), AppLocale.uz);
    });
  });

  group('LocaleStorage', () {
    test('★ TANLANMAGAN HOLAT null — "oʻzbekcha" EMAS', () async {
      // Bu farq muhim: `null` boʻlsa TIZIM tili qoʻllanadi, `uz`
      // boʻlsa foydalanuvchi ataylab oʻzbekchani tanlagan. Ikkisini
      // aralashtirsak, rus telefonidagi odam oʻzbekcha interfeys
      // koʻrardi va buni "ilova buzuq" deb tushunardi
      expect(await LocaleStorage().read(), isNull);
    });

    test('tanlov saqlanadi va oʻqiladi', () async {
      final storage = LocaleStorage();
      await storage.write(AppLocale.ru);

      expect(await storage.read(), AppLocale.ru);
    });
  });

  group('LocaleController', () {
    test('★ BOSHLANGʻICH QIYMAT DARHOL BERILADI', () {
      // Saqlangan tanlov diskdan oʻqilguncha ilova biror til bilan
      // chizilishi kerak. Aks holda birinchi kadr boʻsh boʻlardi
      final controller = LocaleController(LocaleStorage(), AppLocale.ru);
      expect(controller.state, AppLocale.ru);
    });

    test('★ SAQLANGAN TANLOV TIZIM TILINI ALMASHTIRADI', () async {
      SharedPreferences.setMockInitialValues({'app_locale': 'en'});

      // Tizim ruscha deb keldi, lekin foydalanuvchi inglizchani
      // tanlagan edi
      final controller = LocaleController(LocaleStorage(), AppLocale.ru);
      expect(controller.state, AppLocale.ru);

      // Diskdan oʻqish asinxron — bir kadrdan keyin almashadi
      await Future<void>.delayed(Duration.zero);
      expect(controller.state, AppLocale.en);
    });

    test('★ ALMASHTIRISH SAQLANADI', () async {
      final controller = LocaleController(LocaleStorage(), AppLocale.uz);
      await controller.change(AppLocale.ru);

      expect(controller.state, AppLocale.ru);
      expect(await LocaleStorage().read(), AppLocale.ru);
    });

    test('bir xil tilni qayta tanlash yozuvsiz oʻtadi', () async {
      final controller = LocaleController(LocaleStorage(), AppLocale.uz);
      await controller.change(AppLocale.uz);

      // Hech narsa saqlanmadi: foydalanuvchi hech narsa oʻzgartirmadi
      expect(await LocaleStorage().read(), isNull);
    });
  });
}

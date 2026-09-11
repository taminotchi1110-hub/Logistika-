import 'package:flutter/material.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/core/theme/app_theme.dart';
import 'package:karvon/l10n/app_localizations.dart';

/// Widget testlari uchun tarjima sozlamalari.
///
/// NEGA UMUMIY YORDAMCHI: har bir lokalizatsiya qilingan ekran
/// `AppLocalizations.of(context)` ni chaqiradi. Test oʻramida
/// delegatlar boʻlmasa, u `null` qaytaradi va test tushunarsiz xato
/// bilan yiqiladi. 9-bosqichda `phone_screen_test.dart` aynan shunday
/// yiqilgan edi — qolgan 7 ta test faylini bitta joydan tuzatish
/// uchun shu fayl.
///
/// Standart til — OʻZBEK: mavjud testlar oʻzbekcha matnni qidiradi
/// (`find.text('Tasdiqlash')`). Boshqa tilni sinash uchun `locale`
/// beriladi.
const testLocale = AppLocale.uz;

Iterable<Locale> get testSupportedLocales => AppLocale.values.map((value) => value.locale);

const testDelegates = AppLocalizations.localizationsDelegates;

/// `MaterialApp(home: ...)` ning tarjimali varianti.
Widget localizedApp({
  required Widget home,
  AppLocale locale = testLocale,
  ThemeData? theme,
}) =>
    MaterialApp(
      theme: theme ?? AppTheme.light,
      locale: locale.locale,
      supportedLocales: testSupportedLocales,
      localizationsDelegates: testDelegates,
      home: home,
    );

/// `MaterialApp.router(...)` ning tarjimali varianti.
Widget localizedRouterApp({
  required RouterConfig<Object> routerConfig,
  AppLocale locale = testLocale,
  ThemeData? theme,
}) =>
    MaterialApp.router(
      theme: theme ?? AppTheme.light,
      locale: locale.locale,
      supportedLocales: testSupportedLocales,
      localizationsDelegates: testDelegates,
      routerConfig: routerConfig,
    );

/// Test ichida tarjima obyekti — `find.text(l10n.phoneTitle)` kabi
/// ishlatish uchun: matn oʻzgarsa test ham oʻzi yangilanadi.
AppLocalizations l10nFor([AppLocale locale = testLocale]) =>
    lookupAppLocalizations(locale.locale);

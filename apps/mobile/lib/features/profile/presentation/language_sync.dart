import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/l10n/locale_controller.dart';
import '../../../core/providers.dart';
import 'profile_providers.dart';

/// Serverdagi til ilova tiliga moslashtirilishi kerakmi.
///
/// ILOVA TILI USTUVOR: foydalanuvchi interfeysni qaysi tilda ko'rsa,
/// push va SMS ham shu tilda kelishi kerak. Aks holda ruscha
/// interfeysdagi odam o'zbekcha bildirishnoma oladi.
///
/// Faqat to'liq kirgan foydalanuvchida: profil to'ldirilmagan yoki
/// bloklangan akkauntda `PATCH /me` rad etiladi va 401/403 aylanib
/// sessiyani yopib yuborishi mumkin.
bool needsLanguageSync(AuthState auth, AppLocale locale) {
  final user = auth.user;
  return auth.status == AuthStatus.authenticated && user != null && user.lang != locale.code;
}

/// Ilova tilini serverga yetkazadi (`PATCH /me {lang}`).
///
/// Ikki holatda ishga tushadi: foydalanuvchi tilni almashtirganda va
/// tizimga kirganda (boshqa qurilmada boshqa til tanlangan bo'lishi
/// mumkin). Xato to'suvchi emas — keyingi o'zgarishda qayta uriniladi.
///
/// Ilova ildizida (`KarvonApp`) `watch` qilinadi — shunda provayder
/// ilova yashagan davomida faol turadi.
final languageSyncProvider = Provider<void>((ref) {
  var inFlight = false;

  Future<void> sync() async {
    final auth = ref.read(authStateProvider);
    final locale = ref.read(localeControllerProvider);
    if (inFlight || !needsLanguageSync(auth, locale)) return;

    inFlight = true;
    try {
      final updated = await ref.read(profileRepositoryProvider).updateProfile(lang: locale.code);
      // `setUser` holatni yangilaydi va tinglovchi qayta chaqiriladi —
      // endi tillar teng, shuning uchun halqa bo'lmaydi. So'rov davomida
      // til yana almashgan bo'lsa, aynan shu qayta chaqiruv uni yetkazadi
      ref.read(authStateProvider.notifier).setUser(updated);
    } on ApiException {
      // Tarmoq yo'q yoki server band — til muhim, lekin ishni to'xtatmaydi
    } finally {
      inFlight = false;
    }
  }

  ref.listen(localeControllerProvider, (_, __) => sync());
  ref.listen(authStateProvider, (_, __) => sync(), fireImmediately: true);
});

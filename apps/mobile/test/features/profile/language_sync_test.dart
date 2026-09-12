import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/core/providers.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/profile/presentation/language_sync.dart';

/// Ilova tili serverga qachon yetkaziladi.
///
/// Server bildirishnoma va SMS matnini foydalanuvchi tilida tayyorlaydi.
/// Til yetkazilmasa ruscha interfeysdagi odam o'zbekcha push oladi.
void main() {
  const user = AppUser(
    id: 'u-1',
    phone: '+998901234567',
    firstName: 'Anvar',
    lastName: 'Karimov',
    role: UserRole.driver,
    status: UserStatus.active,
  );

  AuthState auth(AuthStatus status, {AppUser? who = user}) => AuthState(status: status, user: who);

  test('★ TIL FARQ QILSA — SERVERGA YETKAZILADI', () {
    // Serverda 'uz' (standart), ilova esa ruscha
    expect(needsLanguageSync(auth(AuthStatus.authenticated), AppLocale.ru), isTrue);
    expect(needsLanguageSync(auth(AuthStatus.authenticated), AppLocale.en), isTrue);
  });

  test('til bir xil boʻlsa soʻrov yuborilmaydi', () {
    // Aks holda har bir holat oʻzgarishida keraksiz PATCH ketardi
    expect(needsLanguageSync(auth(AuthStatus.authenticated), AppLocale.uz), isFalse);
  });

  test('★ TOʻLIQ KIRMAGAN FOYDALANUVCHIDA SOʻROV YOʻQ', () {
    // Server rad etadi va 401/403 sessiyani yopib yuborishi mumkin
    expect(needsLanguageSync(auth(AuthStatus.unauthenticated, who: null), AppLocale.ru), isFalse);
    expect(needsLanguageSync(auth(AuthStatus.unknown, who: null), AppLocale.ru), isFalse);
    expect(needsLanguageSync(auth(AuthStatus.needsProfile), AppLocale.ru), isFalse);
    expect(needsLanguageSync(auth(AuthStatus.blocked), AppLocale.ru), isFalse);
  });

  test('oflayn tiklangan sessiya (foydalanuvchi maʼlumotisiz) — soʻrov yoʻq', () {
    // `restore()` tarmoq yoʻqda foydalanuvchisiz "authenticated" qaytaradi
    expect(needsLanguageSync(auth(AuthStatus.authenticated, who: null), AppLocale.ru), isFalse);
  });
}

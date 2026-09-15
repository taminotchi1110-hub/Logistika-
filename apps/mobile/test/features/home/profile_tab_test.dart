import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/core/providers.dart';
import 'package:karvon/features/auth/data/auth_repository.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/home/presentation/home_shell.dart';
import 'package:karvon/features/profile/data/profile_repository.dart';
import 'package:karvon/features/profile/presentation/profile_providers.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/localized_app.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

class _MockProfileRepository extends Mock implements ProfileRepository {}

/// Profil — hisobni o'chirish.
///
/// DO'KON TALABI (App Store 5.1.1(v), Google Play): hisob ochish mumkin
/// bo'lgan ilovada uni ilovaning o'zidan o'chirish ham mumkin bo'lishi
/// shart. Usiz ilova ko'rib chiqishdan o'tmaydi.
void main() {
  const shipper = AppUser(
    id: 'u-1',
    phone: '+998901234567',
    firstName: 'Dilshod',
    lastName: 'Aliyev',
    role: UserRole.shipper,
    status: UserStatus.active,
  );

  late _MockAuthRepository auth;
  late _MockProfileRepository profile;

  setUp(() {
    auth = _MockAuthRepository();
    profile = _MockProfileRepository();
    when(() => auth.logout()).thenAnswer((_) async {});
    when(() => profile.deleteAccount()).thenAnswer((_) async {});
  });

  Future<void> pump(WidgetTester tester, {AppLocale locale = testLocale}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWithValue(shipper),
          authRepositoryProvider.overrideWithValue(auth),
          profileRepositoryProvider.overrideWithValue(profile),
        ],
        child: localizedApp(locale: locale, home: const ProfileTab()),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Ro'yxatning oxirida — kichik ekranda ko'rinmasligi mumkin.
  Future<void> openDeleteDialog(WidgetTester tester, {AppLocale locale = testLocale}) async {
    final tile = find.text(l10nFor(locale).menuDeleteAccount);
    await tester.scrollUntilVisible(tile, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(tile);
    await tester.pumpAndSettle();
  }

  testWidgets('★ PROFILDA "HISOBNI OʻCHIRISH" BOR', (tester) async {
    await pump(tester);

    await tester.scrollUntilVisible(
      find.text(l10nFor().menuDeleteAccount),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text(l10nFor().menuDeleteAccount), findsOneWidget);
  });

  testWidgets('★ TASDIQLANSA — SERVERDA OʻCHIRILADI VA TIZIMDAN CHIQILADI', (tester) async {
    await pump(tester);
    await openDeleteDialog(tester);

    // Oynada nima o'chishi va nima qolishi aytiladi
    expect(find.text(l10nFor().deleteAccountTitle), findsOneWidget);
    expect(find.text(l10nFor().deleteAccountBody), findsOneWidget);

    await tester.tap(find.text(l10nFor().deleteAccountConfirm));
    await tester.pumpAndSettle();

    verify(() => profile.deleteAccount()).called(1);
    // Mahalliy tokenlar tozalanadi va ilova kirish ekraniga qaytadi
    verify(() => auth.logout()).called(1);
  });

  testWidgets('bekor qilinsa — hech narsa oʻchmaydi', (tester) async {
    await pump(tester);
    await openDeleteDialog(tester);

    await tester.tap(find.text(l10nFor().actionCancel));
    await tester.pumpAndSettle();

    verifyNever(() => profile.deleteAccount());
    verifyNever(() => auth.logout());
  });

  testWidgets('★ SERVER RAD ETSA — SABAB KOʻRSATILADI, TIZIMDA QOLADI', (tester) async {
    when(() => profile.deleteAccount()).thenThrow(
      const ApiException(code: 'ACCOUNT_HAS_OPEN_ORDERS', message: 'server matni', statusCode: 409),
    );

    await pump(tester);
    await openDeleteDialog(tester);
    await tester.tap(find.text(l10nFor().deleteAccountConfirm));
    await tester.pumpAndSettle();

    // Foydalanuvchi nima qilish kerakligini biladi: buyurtmani yakunlash
    expect(find.text(l10nFor().errAccountHasOpenOrders), findsOneWidget);
    expect(find.text('server matni'), findsNothing);
    verifyNever(() => auth.logout());
  });

  testWidgets('ruscha interfeysda ham', (tester) async {
    await pump(tester, locale: AppLocale.ru);
    await openDeleteDialog(tester, locale: AppLocale.ru);

    expect(find.text('Удалить аккаунт?'), findsOneWidget);
    expect(find.text('Удалить навсегда'), findsOneWidget);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karvon/core/providers.dart';
import 'package:karvon/core/theme/app_theme.dart';
import 'package:karvon/features/auth/data/auth_repository.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/auth/presentation/phone_screen.dart';
import 'package:mocktail/mocktail.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

/// Telefon ekrani — kirish oqimining birinchi qadami.
///
/// TEKSHIRILADI: tugma qachon yoqiladi, noto'g'ri prefiks qanday
/// ko'rsatiladi, operator nomi chiqadimi. Bularning har biri
/// foydalanuvchi xatosini ERTA ushlaydi va serverga behuda so'rov
/// yuborilishini oldini oladi.
void main() {
  late _MockAuthRepository repository;

  setUp(() {
    repository = _MockAuthRepository();
  });

  /// Minimal router: `PhoneScreen` navigatsiya uchun `GoRouter` ni
  /// kontekstdan qidiradi, shuning uchun `home:` bilan emas,
  /// `MaterialApp.router` bilan quramiz.
  Future<void> pump(WidgetTester tester) async {
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const PhoneScreen()),
        GoRoute(
          path: '/auth/otp',
          builder: (_, __) => const Scaffold(body: Text('OTP ekrani')),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [authRepositoryProvider.overrideWithValue(repository)],
        child: MaterialApp.router(theme: AppTheme.light, routerConfig: router),
      ),
    );
    await tester.pump();
  }

  testWidgets('boshlangʻich holatda tugma oʻchirilgan', (tester) async {
    await pump(tester);

    final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(button.onPressed, isNull, reason: 'raqam kiritilmagan');
  });

  testWidgets('+998 prefiksi doim koʻrinadi', (tester) async {
    await pump(tester);
    expect(find.text('+998'), findsOneWidget);
  });

  testWidgets('toʻliq raqam kiritilganda tugma yoqiladi', (tester) async {
    await pump(tester);

    await tester.enterText(find.byType(TextField), '901234567');
    await tester.pump();

    final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(button.onPressed, isNotNull);
  });

  testWidgets('operator nomi koʻrsatiladi', (tester) async {
    await pump(tester);

    await tester.enterText(find.byType(TextField), '901234567');
    await tester.pump();

    expect(find.text('Beeline raqami'), findsOneWidget);
  });

  testWidgets('shahar raqami rad etiladi va tugma oʻchiq qoladi', (tester) async {
    await pump(tester);

    // +998 71 — Toshkent shahar raqami, SMS qabul qilmaydi
    await tester.enterText(find.byType(TextField), '711234567');
    await tester.pump();

    expect(find.text('Bu raqam mobil operatorga tegishli emas'), findsOneWidget);

    final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(button.onPressed, isNull);
  });

  testWidgets('chala raqamda xato koʻrsatilmaydi', (tester) async {
    await pump(tester);

    // Foydalanuvchi hali yozayotgan boʻlsa qizil matn chiqmasligi kerak
    await tester.enterText(find.byType(TextField), '9012');
    await tester.pump();

    expect(find.text('Bu raqam mobil operatorga tegishli emas'), findsNothing);
  });

  testWidgets('raqam kiritish paytida boʻsh joy bilan ajratiladi', (tester) async {
    await pump(tester);

    await tester.enterText(find.byType(TextField), '901234567');
    await tester.pump();

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.controller?.text, '90 123 45 67');
  });

  testWidgets('OTP soʻrovi E.164 formatida yuboriladi', (tester) async {
    when(() => repository.requestOtp(any())).thenAnswer(
      (_) async => const OtpChallenge(
        phone: '+998901234567',
        expiresInSeconds: 300,
        resendAfterSeconds: 60,
      ),
    );

    await pump(tester);

    await tester.enterText(find.byType(TextField), '901234567');
    await tester.pump();
    await tester.tap(find.byType(ElevatedButton));
    await tester.pump();

    // Foydalanuvchi "90 123 45 67" kiritdi, serverga esa E.164 ketishi kerak
    verify(() => repository.requestOtp('+998901234567')).called(1);

    await tester.pumpAndSettle();
    expect(find.text('OTP ekrani'), findsOneWidget);
  });
}

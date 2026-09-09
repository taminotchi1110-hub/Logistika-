import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/theme/app_theme.dart';
import 'package:karvon/features/profile/domain/driver_readiness.dart';
import 'package:karvon/features/profile/presentation/widgets/readiness_card.dart';

/// Tayyorlik kartochkasi.
///
/// ENG MUHIM: har bir yetishmayotgan qadam NEGA kerakligi bilan
/// ko'rsatiladi. Quruq talab ro'yxati qarshilik uyg'otadi va tashlab
/// ketishga olib keladi.
void main() {
  DriverReadiness readiness({
    bool identity = false,
    bool license = false,
    bool vehicle = false,
    bool routes = false,
    String status = 'NOT_SUBMITTED',
    bool canSendOffers = false,
    List<String> missing = const [],
  }) =>
      DriverReadiness.fromJson({
        'profileComplete': true,
        'hasIdentity': identity,
        'hasLicense': license,
        'hasVerifiedVehicle': vehicle,
        'hasRoutes': routes,
        'verificationStatus': status,
        'canSendOffers': canSendOffers,
        'missingSteps': missing,
      });

  Future<void> pump(
    WidgetTester tester,
    DriverReadiness data, {
    VoidCallback? onSubmit,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReadinessCard(
              readiness: data,
              onSubmit: onSubmit ?? () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('★ YETISHMAYOTGAN QADAM SABABI BILAN KOʻRSATILADI',
      (tester) async {
    await pump(
      tester,
      readiness(missing: const ['IDENTITY_DOCUMENT', 'ROUTES']),
    );

    expect(find.text('Pasport yuklang'), findsOneWidget);
    // Sababi ham yozilgan — quruq talab qarshilik uygʻotadi
    expect(find.textContaining('asosiy xavfsizlik chorasi'), findsOneWidget);

    expect(find.text('Yoʻnalishlaringizni koʻrsating'), findsOneWidget);
    // Foyda sifatida tushuntiriladi
    expect(find.textContaining('oʻzi topib beradi'), findsOneWidget);
  });

  testWidgets('jarayon nechtadan nechta ekani koʻrsatiladi', (tester) async {
    await pump(tester, readiness(identity: true, license: true));

    expect(find.text('3/5'), findsOneWidget);
  });

  testWidgets('★ HAMMASI TAYYOR — QISQA TASDIQ', (tester) async {
    await pump(
      tester,
      readiness(
        identity: true,
        license: true,
        vehicle: true,
        routes: true,
        status: 'VERIFIED',
        canSendOffers: true,
      ),
    );

    expect(find.textContaining('Hammasi tayyor'), findsOneWidget);
    // Uzun roʻyxat ortiqcha
    expect(find.text('Tekshiruvga yuborish'), findsNothing);
    expect(find.text('3/5'), findsNothing);
  });

  testWidgets('★ HUJJATLAR JOYIDA BOʻLSA YUBORISH TUGMASI CHIQADI',
      (tester) async {
    await pump(
      tester,
      readiness(
        identity: true,
        license: true,
        missing: const ['VERIFIED_VEHICLE'],
      ),
    );

    expect(find.text('Tekshiruvga yuborish'), findsOneWidget);
  });

  testWidgets('hujjatsiz yuborish tugmasi yoʻq', (tester) async {
    await pump(tester, readiness(missing: const ['IDENTITY_DOCUMENT']));

    expect(find.text('Tekshiruvga yuborish'), findsNothing);
  });

  testWidgets('★ TEKSHIRUVDA — QANCHA KUTISH AYTILADI', (tester) async {
    await pump(
      tester,
      readiness(identity: true, license: true, status: 'PENDING'),
    );

    expect(find.text('Tekshiruvda'), findsOneWidget);
    expect(find.textContaining('1 ish kuni'), findsOneWidget);
    // Takroriy yuborish navbatni chalkashtiradi
    expect(find.text('Tekshiruvga yuborish'), findsNothing);
  });

  testWidgets('★ RAD ETILGANDA NIMA QILISH AYTILADI', (tester) async {
    await pump(
      tester,
      readiness(identity: true, license: true, status: 'REJECTED'),
    );

    expect(find.textContaining('rad etildi'), findsOneWidget);
    expect(find.textContaining('qayta yuboring'), findsOneWidget);
  });

  testWidgets('yuborish tugmasi chaqiriladi', (tester) async {
    var tapped = false;
    await pump(
      tester,
      readiness(identity: true, license: true, missing: const ['VERIFIED_VEHICLE']),
      onSubmit: () => tapped = true,
    );

    await tester.tap(find.text('Tekshiruvga yuborish'));
    await tester.pumpAndSettle();

    expect(tapped, isTrue);
  });
}

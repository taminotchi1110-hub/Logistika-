import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/profile/domain/driver_readiness.dart';
import 'package:karvon/features/vehicles/domain/vehicle.dart';
import 'package:karvon/features/profile/presentation/profile_l10n.dart';

import '../../helpers/localized_app.dart';

/// Haydovchining tayyorligi.
///
/// "NIMA YETISHMAYAPTI" SAVOLIGA JAVOB SERVERDA HISOBLANADI. Mijoz
/// tomonida takrorlansa, qoida o'zgarganda ilova serverdan orqada
/// qoladi va foydalanuvchi "hammasi tayyor" deb ko'rsatilgan holda
/// taklif yubora olmaydi.
void main() {
  DriverReadiness readiness({
    bool profile = true,
    bool identity = false,
    bool license = false,
    bool vehicle = false,
    bool routes = false,
    String status = 'NOT_SUBMITTED',
    bool canSendOffers = false,
    List<String> missing = const [],
  }) =>
      DriverReadiness.fromJson({
        'profileComplete': profile,
        'hasIdentity': identity,
        'hasLicense': license,
        'hasVerifiedVehicle': vehicle,
        'hasRoutes': routes,
        'verificationStatus': status,
        'canSendOffers': canSendOffers,
        'missingSteps': missing,
      });

  group('model', () {
    test('server javobi oʻqiladi', () {
      final data = readiness(
        missing: const ['IDENTITY_DOCUMENT', 'DRIVER_LICENSE'],
      );

      expect(data.profileComplete, isTrue);
      expect(data.hasIdentity, isFalse);
      expect(data.verificationStatus, VerificationStatus.notSubmitted);
      expect(data.missingSteps, [
        ReadinessStep.identityDocument,
        ReadinessStep.driverLicense,
      ]);
    });

    test('★ NOMAʼLUM QADAM ILOVANI BUZMAYDI', () {
      // Server yangi talab qoʻshsa eski ilova qulab tushmasligi kerak
      final data = readiness(missing: const ['SOMETHING_NEW']);
      expect(data.missingSteps.single, ReadinessStep.other);
    });

    test('bajarilgan qadamlar sanaladi', () {
      expect(readiness().completedCount, 1);
      expect(readiness(identity: true, license: true).completedCount, 3);
      expect(
        readiness(identity: true, license: true, vehicle: true, routes: true)
            .completedCount,
        5,
      );
    });

    test('jarayon 0..1 oraligʻida', () {
      expect(readiness().progress, closeTo(0.2, 1e-9));
      expect(
        readiness(identity: true, license: true, vehicle: true, routes: true)
            .progress,
        1.0,
      );
    });
  });

  group('tekshiruvga yuborish', () {
    test('★ HUJJATSIZ YUBORIB BOʻLMAYDI', () {
      // Boʻsh soʻrovni adminga yuborish uning vaqtini yeydi
      expect(readiness().canSubmit, isFalse);
      expect(readiness(identity: true).canSubmit, isFalse);
    });

    test('hujjatlar joyida boʻlsa tugma chiqadi', () {
      expect(readiness(identity: true, license: true).canSubmit, isTrue);
    });

    test('★ YUBORILGANDAN KEYIN TUGMA YOʻQOLADI', () {
      // Takroriy yuborish navbatni chalkashtiradi
      final pending = readiness(
        identity: true,
        license: true,
        status: 'PENDING',
      );

      expect(pending.canSubmit, isFalse);
      expect(pending.verificationStatus, VerificationStatus.pending);
    });

    test('tasdiqlangandan keyin ham tugma yoʻq', () {
      final done = readiness(
        identity: true,
        license: true,
        vehicle: true,
        routes: true,
        status: 'VERIFIED',
        canSendOffers: true,
      );

      expect(done.canSubmit, isFalse);
      expect(done.canSendOffers, isTrue);
    });
  });

  group('qadam matnlari', () {
    test('★ HAR BIR QADAM NEGA KERAKLIGI YOZILGAN', () {
      // Quruq talab qarshilik uygʻotadi; sababi aytilgani bajariladi
      for (final step in ReadinessStep.values) {
        expect(step.localized(l10nFor()), isNotEmpty, reason: '$step');
        if (step != ReadinessStep.other) {
          expect(step.why(l10nFor()), isNotEmpty, reason: '$step sababi yoʻq');
        }
      }
    });

    test('yoʻnalish sababi foyda sifatida yozilgan', () {
      // "Koʻrsating" emas, "sizga mos yuklarni oʻzi topib beradi"
      expect(ReadinessStep.routes.why(l10nFor()), contains('oʻzi topib beradi'));
    });
  });

  group('DriverRoute', () {
    test('★ BIGSERIAL SATRDAN OʻQILADI', () {
      // `pg` katta butun sonlarni satr qilib qaytaradi — bu yerda
      // songa oʻgirish tur xatosiga olib kelardi
      expect(
        DriverRoute.fromJson({
          'id': '9007199254740993',
          'fromRegionId': 1,
          'fromRegionName': 'Toshkent shahri',
        }).id,
        '9007199254740993',
      );
    });

    test('yoʻnalish yorligʻi', () {
      final route = DriverRoute.fromJson({
        'id': '1',
        'fromRegionId': 1,
        'fromRegionName': 'Toshkent shahri',
        'toRegionId': 3,
        'toRegionName': 'Samarqand',
        'isRegular': true,
        'priority': 5,
      });

      expect(route.localizedLabel(l10nFor()), 'Toshkent shahri → Samarqand');
      expect(route.isRegular, isTrue);
    });

    test('★ MANZILSIZ YOʻNALISH — "ISTALGAN YOʻNALISH"', () {
      // `toRegionId` boʻsh boʻlsa haydovchi har qayerga tayyor
      final route = DriverRoute.fromJson({
        'id': '2',
        'fromRegionId': 1,
        'fromRegionName': 'Toshkent shahri',
        'toRegionId': null,
        'toRegionName': null,
        'isRegular': false,
        'priority': 0,
      });

      expect(route.toRegionId, isNull);
      expect(route.localizedLabel(l10nFor()), 'Toshkent shahri → istalgan yoʻnalish');
    });
  });
}

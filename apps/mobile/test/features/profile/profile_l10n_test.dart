import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/features/documents/domain/document.dart';
import 'package:karvon/features/documents/presentation/document_l10n.dart';
import 'package:karvon/features/profile/domain/driver_readiness.dart';
import 'package:karvon/features/profile/presentation/profile_l10n.dart';
import 'package:karvon/features/vehicles/domain/vehicle.dart';
import 'package:karvon/features/vehicles/presentation/vehicle_l10n.dart';

import '../../helpers/localized_app.dart';

/// Profil, hujjat va tekshiruv yorliqlari tarjimasi.
void main() {
  const route = DriverRoute(
    id: '1',
    fromRegionId: 1,
    fromRegionName: 'Toshkent shahri',
    toRegionId: 8,
    toRegionName: 'Samarqand',
    isRegular: true,
    priority: 0,
  );

  group('yoʻnalish nomi', () {
    test('★ VILOYAT NOMI SPRAVOCHNIKDAN JORIY TILDA', () {
      // Server nomni oʻzbekcha beradi — ruscha interfeysda "Toshkent
      // shahri → Samarqand" chiqardi
      const names = {1: 'Ташкент', 8: 'Самарканд'};
      expect(
        route.localizedLabel(l10nFor(AppLocale.ru), regionName: (id) => names[id]),
        'Ташкент → Самарканд',
      );
    });

    test('spravochnik yuklanmagan — server nomi', () {
      // Boʻsh joydan oʻzbekcha nom yaxshiroq
      expect(route.localizedLabel(l10nFor(AppLocale.ru)), 'Toshkent shahri → Samarqand');
    });

    test('★ "ISTALGAN YOʻNALISH" TARJIMA QILINADI', () {
      const anywhere = DriverRoute(
        id: '2',
        fromRegionId: 1,
        fromRegionName: 'Toshkent shahri',
        isRegular: false,
        priority: 0,
      );
      expect(anywhere.localizedLabel(l10nFor(AppLocale.en)), 'Toshkent shahri → anywhere');
      expect(anywhere.localizedLabel(l10nFor(AppLocale.ru)), 'Toshkent shahri → любое направление');
    });
  });

  test('★ HAR BIR QADAM NOMI VA SABABI UCH TILDA', () {
    for (final locale in AppLocale.values) {
      final l10n = l10nFor(locale);
      for (final step in ReadinessStep.values) {
        expect(step.localized(l10n), isNotEmpty, reason: '$step ${locale.code}');
        // "Boshqa" — server yangi qadam qoʻshgan; sababni ilova bilmaydi
        if (step != ReadinessStep.other) {
          expect(step.why(l10n), isNotEmpty, reason: '$step ${locale.code} sababi yoʻq');
        }
      }
    }
  });

  test('hujjat turlari va tekshiruv holatlari takrorlanmaydi', () {
    for (final locale in AppLocale.values) {
      final l10n = l10nFor(locale);
      expect(
        DocumentType.values.map((type) => type.localized(l10n)).toSet(),
        hasLength(DocumentType.values.length),
        reason: locale.code,
      );
      expect(
        VerificationStatus.values.map((status) => status.localized(l10n)).toSet(),
        hasLength(VerificationStatus.values.length),
        reason: locale.code,
      );
    }
  });
}

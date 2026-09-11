import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/l10n/formatters.dart';
import 'package:karvon/core/l10n/locale_controller.dart';
import 'package:karvon/core/utils/money.dart';
import 'package:karvon/features/loads/domain/load.dart';
import 'package:karvon/features/loads/presentation/load_l10n.dart';

import '../../helpers/localized_app.dart';

/// Yuk yorliqlari va moslik sabablari tarjimasi.
void main() {
  group('localizeMatchReason', () {
    test('★ SERVER KODI JORIY TILDA KOʻRSATILADI', () {
      // Avval server tayyor oʻzbekcha jumla yuborardi va ruscha
      // interfeysda "Sizga 12 km" chiqardi
      expect(localizeMatchReason(l10nFor(AppLocale.ru), 'NEAR_PICKUP:12'), 'До вас 12 км');
      expect(localizeMatchReason(l10nFor(AppLocale.en), 'REGULAR_ROUTE'), 'Your regular route');
      expect(localizeMatchReason(l10nFor(AppLocale.uz), 'HIGH_RATING:4.8'), 'Reytingingiz 4.8');
    });

    test('★ ESKI SERVER MATNI OʻZGARMAY QOLADI', () {
      // Yangilash bosqichma-bosqich boradi: eski server hali matn
      // yuborishi mumkin va boʻsh joydan oʻzbekcha matn yaxshiroq
      expect(localizeMatchReason(l10nFor(AppLocale.ru), 'Doimiy yoʻnalishingiz'), 'Doimiy yoʻnalishingiz');
    });

    test('parametri yoʻq parametrli kod xom holda qaytadi', () {
      // "NEAR_PICKUP:" — buzuq qiymat; "До вас  км" dan xom kod yaxshiroq
      expect(localizeMatchReason(l10nFor(AppLocale.ru), 'NEAR_PICKUP'), 'NEAR_PICKUP');
    });

    test('backend yuboradigan barcha kodlar tanilgan', () {
      // `apps/api/src/modules/matching/match-score.ts` dagi `buildReasons`
      const codes = [
        'NEAR_PICKUP:5',
        'REGULAR_ROUTE',
        'ROUTE_MATCH',
        'CAPACITY_FIT',
        'HIGH_RATING:4.9',
        'PREMIUM',
      ];
      for (final code in codes) {
        final text = localizeMatchReason(l10nFor(AppLocale.en), code);
        expect(text, isNot(code), reason: '$code tarjima qilinmadi');
        expect(text, isNot(contains('_')));
      }
    });
  });

  group('LoadStatus', () {
    test('★ HAR BIR HOLAT UCH TILDA', () {
      for (final locale in AppLocale.values) {
        final labels = LoadStatus.values.map((status) => status.localized(l10nFor(locale)));
        // Takrorlanmasin: ikki holat bir xil nom olsa, mijoz ularni
        // ajrata olmaydi
        expect(labels.toSet(), hasLength(LoadStatus.values.length), reason: locale.code);
      }
    });
  });

  group('birliklar', () {
    test('★ TARJIMADAN BIRLIKLAR YIGʻILADI', () {
      final ru = l10nFor(AppLocale.ru).units;
      expect(formatWeight(750, units: ru), '750 кг');
      expect(formatSoum('24000000', units: l10nFor(AppLocale.en).units), '240 000 UZS');
    });

    test('oʻzbekcha tarjima standart birliklar bilan bir xil', () {
      // Aks holda standart qiymat bilan tarjima orasida farq paydo
      // boʻladi va ekranning bir qismi boshqacha yozadi
      final uz = l10nFor(AppLocale.uz).units;
      expect(uz.soum, UnitLabels.uz.soum);
      expect(uz.hour, UnitLabels.uz.hour);
      expect(uz.kg, UnitLabels.uz.kg);
    });
  });

  group('oy nomlari', () {
    test('★ HAR TILDA AYNAN 12 TA OY', () {
      // Vergul bilan bitta kalit: tarjimon bittasini tushirib qoldirsa,
      // dekabr "noyabr" boʻlib chiqardi
      for (final locale in AppLocale.values) {
        expect(l10nFor(locale).monthsShort.split(','), hasLength(12), reason: locale.code);
      }
    });
  });
}

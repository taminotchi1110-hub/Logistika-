import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/utils/money.dart';

void main() {
  group('parseTiyin', () {
    test('backend satrini oʻgiradi', () {
      expect(parseTiyin('24000000'), BigInt.from(24000000));
      expect(parseTiyin('-800000'), BigInt.from(-800000));
    });

    test('null va boʻsh qiymat — nol', () {
      expect(parseTiyin(null), BigInt.zero);
      expect(parseTiyin(''), BigInt.zero);
      expect(parseTiyin('   '), BigInt.zero);
    });

    test('notoʻgʻri qiymatda yiqilmaydi', () {
      expect(parseTiyin('abc'), BigInt.zero);
      expect(parseTiyin('12.5'), BigInt.zero);
    });

    test('katta sonda aniqlik yoʻqolmaydi', () {
      const huge = '9007199254740993';
      expect(parseTiyin(huge).toString(), huge);
    });

    test('int ham qabul qilinadi', () {
      expect(parseTiyin(5000), BigInt.from(5000));
    });
  });

  group('formatSoum', () {
    test('uch xonalab probel bilan ajratadi', () {
      expect(formatSoum('24000000'), '240 000 soʻm');
      expect(formatSoum('100'), '1 soʻm');
      expect(formatSoum('100000000'), '1 000 000 soʻm');
    });

    test('manfiy qiymat', () {
      expect(formatSoum('-24000000'), '−240 000 soʻm');
    });

    test('nol', () {
      expect(formatSoum('0'), '0 soʻm');
      expect(formatSoum(null), '0 soʻm');
    });

    test('qoʻshimchasiz', () {
      expect(formatSoum('24000000', withSuffix: false), '240 000');
    });

    test('tiyin bilan', () {
      expect(formatSoum('150050', withTiyin: true), '1 500,50 soʻm');
    });
  });

  group('formatSoumShort', () {
    test('ming va million', () {
      expect(formatSoumShort('24000000'), '240 ming soʻm');
      expect(formatSoumShort('240000000'), '2.4 mln soʻm');
      expect(formatSoumShort('1000000000'), '10 mln soʻm');
    });

    test('kichik summa', () {
      expect(formatSoumShort('50000'), '500 soʻm');
    });
  });

  group('soumToTiyin', () {
    test('ajratkichlarni tashlaydi', () {
      expect(soumToTiyin('240 000'), BigInt.from(24000000));
      expect(soumToTiyin('240000'), BigInt.from(24000000));
    });

    test('boʻsh kiritish — nol', () {
      expect(soumToTiyin(''), BigInt.zero);
      expect(soumToTiyin('abc'), BigInt.zero);
    });
  });

  group('groupSoumInput', () {
    test('kiritish paytida ajratadi', () {
      expect(groupSoumInput('240000'), '240 000');
      expect(groupSoumInput('1'), '1');
      expect(groupSoumInput('1234567'), '1 234 567');
    });

    test('boʻsh kiritish', () {
      expect(groupSoumInput(''), '');
    });
  });

  group('formatWeight', () {
    test('tonna va kilogramm', () {
      expect(formatWeight(4000), '4 t');
      expect(formatWeight(4500), '4.5 t');
      expect(formatWeight(750), '750 kg');
      expect(formatWeight(1000), '1 t');
    });
  });

  group('formatDistance', () {
    test('km va metr', () {
      expect(formatDistance(328.4), '328 km');
      expect(formatDistance(0.8), '800 m');
      expect(formatDistance(null), '—');
    });
  });

  group('formatDuration', () {
    test('soat va daqiqa', () {
      expect(formatDuration(95), '1 soat 35 daq');
      expect(formatDuration(45), '45 daq');
      expect(formatDuration(120), '2 soat');
      expect(formatDuration(null), '—');
      expect(formatDuration(0), '—');
    });
  });
}

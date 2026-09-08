import {
  formatSoum,
  formatSoumShort,
  percentOf,
  soumToTiyin,
  toTiyin,
} from './money.util';

describe('toTiyin', () => {
  it('bazadan kelgan satrni oʻgiradi', () => {
    expect(toTiyin('24000000')).toBe(24_000_000n);
    expect(toTiyin('-500')).toBe(-500n);
  });

  it('bosh qiymat — nol', () => {
    expect(toTiyin(null)).toBe(0n);
    expect(toTiyin(undefined)).toBe(0n);
  });

  it('katta sonda aniqlik yoʻqolmaydi', () => {
    // 90 mlrd soʻm — number bilan bu son buziladi
    const huge = '9007199254740993';
    expect(toTiyin(huge).toString()).toBe(huge);
  });

  it('kasrli number rad etiladi', () => {
    expect(() => toTiyin(10.5)).toThrow(TypeError);
  });

  it('notoʻgʻri satr rad etiladi', () => {
    expect(() => toTiyin('12.5')).toThrow(TypeError);
    expect(() => toTiyin('abc')).toThrow(TypeError);
    expect(() => toTiyin('')).toThrow(TypeError);
  });
});

describe('percentOf', () => {
  it('5% komissiya', () => {
    expect(percentOf(24_000_000n, 0.05)).toBe(1_200_000n);
  });

  it('pastga yaxlitlaydi — komissiya summadan oshmaydi', () => {
    // 999 tiyin dan 5% = 49.95 → 49
    expect(percentOf(999n, 0.05)).toBe(49n);
  });

  it('nol foiz — nol', () => {
    expect(percentOf(24_000_000n, 0)).toBe(0n);
  });

  it('toʻrt kasr xonasi aniq ishlaydi', () => {
    expect(percentOf(1_000_000n, 0.0425)).toBe(42_500n);
  });

  it('manfiy foiz rad etiladi', () => {
    expect(() => percentOf(1000n, -0.1)).toThrow(TypeError);
  });

  it('katta summada ham aniq', () => {
    // 100 mlrd soʻm dan 4%
    expect(percentOf(10_000_000_000_000n, 0.04)).toBe(400_000_000_000n);
  });
});

describe('formatSoum', () => {
  it('uch xonalab ajratadi', () => {
    expect(formatSoum(24_000_000n)).toBe('240 000 soʻm');
    expect(formatSoum(100n)).toBe('1 soʻm');
  });

  it('manfiy qiymat', () => {
    expect(formatSoum(-24_000_000n)).toBe('−240 000 soʻm');
  });

  it('tiyin bilan', () => {
    expect(formatSoum(150_050n, true)).toBe('1 500,50 soʻm');
  });

  it('nol', () => {
    expect(formatSoum(0n)).toBe('0 soʻm');
  });

  it('satr ham qabul qilinadi', () => {
    expect(formatSoum('24000000')).toBe('240 000 soʻm');
  });
});

describe('formatSoumShort', () => {
  it('mingdan millionga', () => {
    expect(formatSoumShort(24_000_000n)).toBe('240 ming soʻm');
    expect(formatSoumShort(240_000_000n)).toBe('2.4 mln soʻm');
    expect(formatSoumShort(1_000_000_000n)).toBe('10 mln soʻm');
  });

  it('kichik summa', () => {
    expect(formatSoumShort(50_000n)).toBe('500 soʻm');
  });
});

describe('soumToTiyin', () => {
  it('butun soʻm', () => {
    expect(soumToTiyin(240_000)).toBe(24_000_000n);
  });

  it('kasrli soʻm', () => {
    expect(soumToTiyin(1500.5)).toBe(150_050n);
  });

  it('suzuvchi nuqta xatosi yuzaga kelmaydi', () => {
    // 0.1 + 0.2 = 0.30000000000000004 muammosi
    expect(soumToTiyin(0.1 + 0.2)).toBe(30n);
  });
});

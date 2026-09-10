import { describe, expect, it } from 'vitest';

import {
  formatSoum,
  shortDate,
  summarize,
  tiyinToSoum,
  toChartPoints,
  type SeriesPoint,
} from './metrics';

/**
 * Boshqaruv paneli hisob-kitoblari.
 *
 * PUL BILAN ISHLASH — eng nozik joy. Noto'g'ri ko'rsatilgan daromad
 * boshqaruv qarorini o'zgartiradi va uni hech kim tekshirmaydi:
 * raqam ishonchli ko'rinadi.
 */

function point(overrides: Partial<SeriesPoint> = {}): SeriesPoint {
  return {
    date: '2026-09-01',
    created: 0,
    cancelled: 0,
    completed: 0,
    gmvTiyin: '0',
    commissionTiyin: '0',
    ...overrides,
  };
}

describe('shortDate', () => {
  it('★ SANA `Date` ORQALI OʻTKAZILMAYDI', () => {
    // `new Date('2026-09-12')` ni brauzer UTC deb o'qiydi va manfiy
    // siljishli zonalarda kun BIR KUNGA ORQAGA ketadi. Server
    // allaqachon Toshkent sanasini yuborgan
    expect(shortDate('2026-09-12')).toBe('12 sen');
    expect(shortDate('2026-01-01')).toBe('1 yan');
    expect(shortDate('2026-12-31')).toBe('31 dek');
  });

  it('buzuq sana yiqitmaydi', () => {
    expect(shortDate('nonsense')).toBe('nonsense');
  });
});

describe('tiyinToSoum', () => {
  it('tiyin soʻmga oʻtkaziladi', () => {
    expect(tiyinToSoum('150000')).toBe(1500);
    expect(tiyinToSoum('0')).toBe(0);
  });

  it('★ BOʻSH SATR NOL BOʻLADI, NaN EMAS', () => {
    // Server bo'sh qiymat yuborsa, grafikda `NaN` chiziqni butunlay
    // yo'q qiladi va sabab ko'rinmaydi
    expect(tiyinToSoum('')).toBe(0);
  });

  it('★ KATTA SUMMA YAXLITLANMAYDI', () => {
    // 100 milliard so'm = 10 trillion tiyin. `Number` bilan
    // hisoblanganda aniqlik yo'qolishi mumkin
    expect(tiyinToSoum('10000000000000')).toBe(100000000000);
  });
});

describe('summarize', () => {
  it('★ ORALIQ YIGʻINDISI TOʻGʻRI', () => {
    const totals = summarize([
      point({ created: 10, completed: 7, cancelled: 2, gmvTiyin: '100', commissionTiyin: '5' }),
      point({ created: 5, completed: 3, cancelled: 1, gmvTiyin: '200', commissionTiyin: '10' }),
    ]);

    expect(totals.created).toBe(15);
    expect(totals.completed).toBe(10);
    expect(totals.cancelled).toBe(3);
    expect(totals.gmvTiyin).toBe('300');
    expect(totals.commissionTiyin).toBe('15');
  });

  it('★ PUL BigInt BILAN QOʻSHILADI', () => {
    // `Number` bilan qo'shilsa, katta summalarda oxirgi raqamlar
    // yo'qoladi va jami noto'g'ri chiqadi
    const totals = summarize([
      point({ gmvTiyin: '9007199254740993' }),
      point({ gmvTiyin: '1' }),
    ]);

    expect(totals.gmvTiyin).toBe('9007199254740994');
  });

  it('★ BUYURTMASIZ ORALIQDA NaN% BOʻLMAYDI', () => {
    const totals = summarize([point(), point()]);

    expect(totals.completionRate).toBe(0);
    expect(Number.isNaN(totals.completionRate)).toBe(false);
  });

  it('yakunlanish foizi hisoblanadi', () => {
    const totals = summarize([point({ created: 8, completed: 6 })]);
    expect(totals.completionRate).toBe(75);
  });

  it('boʻsh qator — hamma narsa nol', () => {
    const totals = summarize([]);
    expect(totals).toMatchObject({ created: 0, gmvTiyin: '0', completionRate: 0 });
  });
});

describe('toChartPoints', () => {
  it('★ SERVER TARTIBI SAQLANADI', () => {
    // Qayta tartiblash grafikni buzadi: server allaqachon o'sish
    // tartibida yuboradi
    const points = toChartPoints([
      point({ date: '2026-09-01' }),
      point({ date: '2026-09-02' }),
      point({ date: '2026-09-03' }),
    ]);

    expect(points.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(points.map((p) => p.label)).toEqual(['1 sen', '2 sen', '3 sen']);
  });
});

describe('formatSoum', () => {
  it('★ MINGLAR AJRATILADI', () => {
    // "12500000 soʻm" ni o'qib bo'lmaydi — operator nolni sanashi
    // kerak bo'ladi
    expect(formatSoum('1250000000')).toBe('12 500 000 soʻm');
    expect(formatSoum('100')).toBe('1 soʻm');
    expect(formatSoum('0')).toBe('0 soʻm');
  });

  it('boʻsh qiymat nol boʻladi', () => {
    expect(formatSoum('')).toBe('0 soʻm');
  });
});

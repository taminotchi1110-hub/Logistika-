import { describe, expect, it } from 'vitest';

import { formatSoum, parseTiyin, sumTiyin } from '@/lib/money';

import {
  isOverdue,
  isValidTxnId,
  mismatchDelta,
  payoutTotal,
  waitingHours,
  waitingLabel,
  type Payout,
} from './payouts';

/**
 * Moliya mantiqi.
 *
 * Bu yerdagi har bir xato — pul xatosi. Ular jim bo'ladi: raqam
 * ishonchli ko'rinadi va uni hech kim qayta hisoblamaydi.
 */

function payout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: 'p-1',
    amountTiyin: '100000',
    cardMask: '8600 **** **** 1234',
    status: 'PENDING',
    requestedAt: '2026-09-10T08:00:00.000Z',
    driverId: 'u-1',
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '+998901112233',
    ...overrides,
  };
}

describe('parseTiyin', () => {
  it('★ BOʻSH VA BUZUQ QIYMAT EKRANNI YIQITMAYDI', () => {
    // Server kutilmagan narsa yuborsa, moliya ekrani ishlashda davom
    // etishi kerak — u yerda boshqa soʻrovlar ham koʻrsatiladi
    expect(parseTiyin('')).toBe(0n);
    expect(parseTiyin('salom')).toBe(0n);
    expect(parseTiyin('12.5')).toBe(0n);
  });

  it('katta son aniqligini saqlaydi', () => {
    expect(parseTiyin('9007199254740993')).toBe(9007199254740993n);
  });
});

describe('sumTiyin', () => {
  it('★ YIGʻINDI BigInt DA — OXIRGI TIYIN YOʻQOLMAYDI', () => {
    // `Number` bilan qoʻshilsa, katta summalarda oxirgi raqamlar
    // yoʻqoladi va jami notoʻgʻri chiqadi
    expect(sumTiyin(['9007199254740993', '1'])).toBe('9007199254740994');
  });

  it('boʻsh roʻyxat — nol', () => {
    expect(sumTiyin([])).toBe('0');
  });
});

describe('formatSoum', () => {
  it('minglar ajratiladi', () => {
    expect(formatSoum('125000000')).toBe('1 250 000 soʻm');
    expect(formatSoum('100')).toBe('1 soʻm');
  });

  it('★ MANFIY SUMMA MANFIY KOʻRINADI', () => {
    // Ledger nomuvofiqligida farq manfiy boʻlishi mumkin va uni
    // musbat koʻrsatish muammoni teskari tomonga oʻgirib qoʻyardi
    expect(formatSoum('-250000')).toBe('−2 500 soʻm');
  });
});

describe('payoutTotal', () => {
  it('★ NAVBAT JAMISI KOʻRSATILADI', () => {
    // Operator bankka oʻtishdan oldin "bugun qancha pul kerak?"
    // degan savolga javob oladi
    const total = payoutTotal([
      payout({ amountTiyin: '100000' }),
      payout({ id: 'p-2', amountTiyin: '250000' }),
    ]);

    expect(formatSoum(total)).toBe('3 500 soʻm');
  });
});

describe('waitingHours', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  it('kutish vaqti soatda hisoblanadi', () => {
    expect(waitingHours('2026-09-10T09:00:00.000Z', now)).toBe(3);
    expect(waitingHours('2026-09-10T11:59:00.000Z', now)).toBe(0);
  });

  it('★ KELAJAKDAGI SANA MANFIY BERMAYDI', () => {
    // Soatlar farq qilsa yoki server vaqti oldinda boʻlsa, "-2 soat
    // kutmoqda" degan yozuv chiqardi
    expect(waitingHours('2026-09-10T15:00:00.000Z', now)).toBe(0);
  });

  it('buzuq sana yiqitmaydi', () => {
    expect(waitingHours('nonsense', now)).toBe(0);
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  it('★ 24 SOATDAN OSHGANI ALOHIDA BELGILANADI', () => {
    // Haydovchi uchun bu "pulim yoʻqoldi" degani va u qoʻllab-
    // quvvatlashga yozadi
    expect(isOverdue('2026-09-09T11:00:00.000Z', now)).toBe(true);
    expect(isOverdue('2026-09-10T00:00:00.000Z', now)).toBe(false);
  });
});

describe('waitingLabel', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  it('vaqt oʻqiladigan shaklda', () => {
    expect(waitingLabel('2026-09-10T11:40:00.000Z', now)).toBe('hozir');
    expect(waitingLabel('2026-09-10T09:00:00.000Z', now)).toBe('3 soat kutmoqda');
    expect(waitingLabel('2026-09-08T12:00:00.000Z', now)).toBe('2 kun kutmoqda');
  });
});

describe('isValidTxnId', () => {
  it('★ BOʻSH RAQAM QABUL QILINMAYDI', () => {
    // Server uni ixtiyoriy qiladi va boʻsh boʻlsa "MANUAL" yozadi.
    // Lekin bu raqam ledger bilan bank koʻchirmasi orasidagi yagona
    // bogʻlanish — usiz oy oxirida pulni izlab boʻlmaydi
    expect(isValidTxnId('')).toBe(false);
    expect(isValidTxnId('   ')).toBe(false);
  });

  it('haqiqiy raqam qabul qilinadi', () => {
    expect(isValidTxnId('BANK-2026-0001')).toBe(true);
    // Operator ataylab "MANUAL" yozsa — bu ongli qaror va auditda
    // shundayligicha koʻrinadi
    expect(isValidTxnId('MANUAL')).toBe(true);
  });
});

describe('mismatchDelta', () => {
  it('★ FARQ HISOBLANADI — QANCHA PUL "YOʻQOLGAN"', () => {
    expect(mismatchDelta({ stored: '500000', computed: '450000' })).toBe('50000');
    expect(mismatchDelta({ stored: '450000', computed: '500000' })).toBe('-50000');
  });
});

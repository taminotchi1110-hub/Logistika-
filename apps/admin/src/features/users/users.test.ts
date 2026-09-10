import { describe, expect, it } from 'vitest';

import {
  cancelRate,
  formatRating,
  fullName,
  reasonRequired,
  shortDateTime,
  statusTone,
} from './users';

/**
 * Foydalanuvchilar bo'limi mantiqi.
 *
 * Bu raqamlar asosida operator odamni bloklaydi. Noto'g'ri ko'rsatilgan
 * reyting yoki bekor qilish ulushi — noto'g'ri qaror.
 */

describe('formatRating', () => {
  it('★ BAHOSIZ FOYDALANUVCHIDA "0.0" EMAS, "—"', () => {
    // `rating_avg` bahosiz foydalanuvchida 0 bo'ladi. "0.0 ★" —
    // yangi haydovchini eng yomon baholangan qilib ko'rsatish demak,
    // va operator uni shu asosda bloklashi mumkin
    expect(formatRating('0', 0)).toBe('—');
    expect(formatRating('0.00', 0)).toBe('—');
  });

  it('baho bor boʻlsa soni bilan koʻrsatiladi', () => {
    // Soni MUHIM: 5.0 (1 ta baho) va 4.8 (200 ta baho) — ikkinchisi
    // ancha ishonchli
    expect(formatRating('4.75', 12)).toBe('4.8 (12)');
    expect(formatRating('5', 1)).toBe('5.0 (1)');
  });

  it('★ BUZUQ QIYMAT "NaN" KOʻRSATMAYDI', () => {
    expect(formatRating('salom', 5)).toBe('—');
    expect(formatRating('', 5)).toBe('—');
  });
});

describe('cancelRate', () => {
  it('★ KAM BUYURTMADA ULUSH KOʻRSATILMAYDI', () => {
    // 1 tadan 1 tasi bekor qilingan — bu 100%, lekin u hech narsani
    // anglatmaydi va yangi haydovchini yomon koʻrsatadi
    expect(cancelRate({ completedOrders: 0, cancelledOrders: 1 })).toBeNull();
    expect(cancelRate({ completedOrders: 2, cancelledOrders: 2 })).toBeNull();
  });

  it('yetarli maʼlumotda ulush hisoblanadi', () => {
    expect(cancelRate({ completedOrders: 8, cancelledOrders: 2 })).toBe(20);
    expect(cancelRate({ completedOrders: 5, cancelledOrders: 5 })).toBe(50);
  });

  it('chegara — 5 ta yakuniy holat', () => {
    expect(cancelRate({ completedOrders: 4, cancelledOrders: 0 })).toBeNull();
    expect(cancelRate({ completedOrders: 5, cancelledOrders: 0 })).toBe(0);
  });
});

describe('reasonRequired', () => {
  it('★ BLOKLASHDA SABAB MAJBURIY', () => {
    // Bloklash barcha sessiyalarni bir zumda bekor qiladi; odam
    // qo'llab-quvvatlashga murojaat qiladi va operator sababni
    // auditdan o'qiy olishi kerak
    expect(reasonRequired('BANNED')).toBe(true);
    expect(reasonRequired('SUSPENDED')).toBe(true);
  });

  it('blokni ochishda sabab shart emas', () => {
    expect(reasonRequired('ACTIVE')).toBe(false);
  });
});

describe('statusTone', () => {
  it('★ HOLATLAR KOʻZ BILAN AJRALADI', () => {
    expect(statusTone('ACTIVE')).toBe('ok');
    expect(statusTone('SUSPENDED')).toBe('warn');
    expect(statusTone('BANNED')).toBe('danger');
    expect(statusTone('DELETED')).toBe('danger');
    expect(statusTone('PENDING_PROFILE')).toBe('muted');
  });
});

describe('fullName', () => {
  it('★ ISMSIZ FOYDALANUVCHI BOʻSH QATOR BOʻLIB QOLMAYDI', () => {
    expect(fullName({ firstName: null, lastName: null })).toBe('Ism koʻrsatilmagan');
    expect(fullName({ firstName: '  ', lastName: null })).toBe('Ism koʻrsatilmagan');
  });

  it('yarim toʻldirilgan ism ham koʻrsatiladi', () => {
    expect(fullName({ firstName: 'Ali', lastName: null })).toBe('Ali');
    expect(fullName({ firstName: null, lastName: 'Valiyev' })).toBe('Valiyev');
  });
});

describe('shortDateTime', () => {
  it('sana koʻrsatiladi', () => {
    expect(shortDateTime('2026-09-10T08:00:00.000Z')).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it('★ BOʻSH VA BUZUQ SANA "Invalid Date" BERMAYDI', () => {
    expect(shortDateTime(null)).toBe('—');
    expect(shortDateTime('nonsense')).toBe('—');
  });
});

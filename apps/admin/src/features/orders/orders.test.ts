import { describe, expect, it } from 'vitest';

import { gapLabel, gapMinutes, isFinished, isMasked, moment, orderTone, personName } from './orders';

/**
 * Buyurtma monitoringi mantiqi.
 *
 * Support operatori shu ma'lumot asosida odamga qo'ng'iroq qiladi va
 * pul haqida qaror qabul qiladi.
 */

describe('orderTone', () => {
  it('★ NIZO QIZIL, BEKOR QILINGAN KULRANG', () => {
    // Ikkalasi ham "yomon" natija, lekin NIZO ISH TALAB QILADI,
    // bekor qilingan esa allaqachon tugagan. Bir xil rangda
    // ko'rsatish operatorni kerakmas qatorlarga tortadi
    expect(orderTone('DISPUTED')).toBe('danger');
    expect(orderTone('CANCELLED_BY_SHIPPER')).toBe('muted');
    expect(orderTone('CANCELLED_BY_DRIVER')).toBe('muted');
    expect(orderTone('CANCELLED_BY_ADMIN')).toBe('muted');
  });

  it('yakunlangan yashil, yetkazilgan sariq', () => {
    expect(orderTone('COMPLETED')).toBe('ok');
    expect(orderTone('CLOSED')).toBe('ok');
    // `DELIVERED` — hali yopilmagan: yuk beruvchi tasdiqlashi kerak
    expect(orderTone('DELIVERED')).toBe('warn');
  });

  it('faol holatlar ajratiladi', () => {
    expect(orderTone('IN_TRANSIT')).toBe('active');
    expect(orderTone('ASSIGNED')).toBe('active');
  });
});

describe('isFinished', () => {
  it('★ TUGAGAN BUYURTMADA KUZATUV MAʼNOSIZ', () => {
    expect(isFinished('COMPLETED')).toBe(true);
    expect(isFinished('CLOSED')).toBe(true);
    expect(isFinished('CANCELLED_BY_ADMIN')).toBe(true);
  });

  it('nizoli buyurtma TUGAMAGAN', () => {
    // Nizo ochiq: pul hali taqsimlanmagan va ish qilinishi kerak
    expect(isFinished('DISPUTED')).toBe(false);
    expect(isFinished('IN_TRANSIT')).toBe(false);
  });
});

describe('isMasked', () => {
  it('★ YASHIRILGAN RAQAM ANIQLANADI', () => {
    // Interfeys shu asosda "Raqamni koʻrsatish" tugmasini chizadi
    expect(isMasked('+9989011****3')).toBe(true);
    expect(isMasked('+998901112233')).toBe(false);
    expect(isMasked(null)).toBe(false);
  });
});

describe('gapMinutes', () => {
  it('★ IKKI BOSQICH ORASIDAGI VAQT HISOBLANADI', () => {
    // Tarixdagi eng foydali raqam: "yuk olish joyida" dan
    // "yuklandi" gacha ikki soat ketgan boʻlsa, muammo oʻsha yerda
    expect(gapMinutes('2026-09-10T08:00:00Z', '2026-09-10T10:30:00Z')).toBe(150);
    expect(gapMinutes('2026-09-10T08:00:00Z', '2026-09-10T08:05:00Z')).toBe(5);
  });

  it('★ TESKARI TARTIB MANFIY BERMAYDI', () => {
    // Server soati bir necha soniyaga orqada boʻlsa, "-1 daq"
    // koʻrinishidagi yozuv chiqardi
    expect(gapMinutes('2026-09-10T10:00:00Z', '2026-09-10T09:00:00Z')).toBe(0);
  });

  it('buzuq sana null qaytaradi', () => {
    expect(gapMinutes('nonsense', '2026-09-10T09:00:00Z')).toBeNull();
  });
});

describe('gapLabel', () => {
  it('vaqt oʻqiladigan shaklda', () => {
    expect(gapLabel(45)).toBe('+45 daq');
    expect(gapLabel(120)).toBe('+2 soat');
    expect(gapLabel(150)).toBe('+2 soat 30 daq');
    expect(gapLabel(null)).toBe('');
  });
});

describe('personName', () => {
  it('ismsiz foydalanuvchi boʻsh qator boʻlib qolmaydi', () => {
    expect(personName({ firstName: null, lastName: null })).toBe('Ism koʻrsatilmagan');
  });
});

describe('moment', () => {
  it('★ BOʻSH VA BUZUQ SANA "Invalid Date" BERMAYDI', () => {
    expect(moment(null)).toBe('—');
    expect(moment('nonsense')).toBe('—');
  });

  it('sana va vaqt koʻrsatiladi', () => {
    expect(moment('2026-09-10T08:30:00.000Z')).toMatch(/\d{2}\.\d{2}/);
  });
});

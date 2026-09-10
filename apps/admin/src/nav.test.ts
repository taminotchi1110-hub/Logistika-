import { describe, expect, it } from 'vitest';

import { hasPermission } from './lib/permissions';
import { GROUP_LABELS, NAV_ITEMS, visibleNavItems } from './nav';

/**
 * Menyu huquq bo'yicha filtrlanadi.
 *
 * BU HIMOYA EMAS — server har safar qayta tekshiradi. Lekin interfeys
 * to'g'riligi: bosilganda 403 beradigan bo'lim panelni buzilgan
 * ko'rsatadi va operator qo'llab-quvvatlashga yozadi.
 */
describe('visibleNavItems', () => {
  const can = (permissions: string[]) => (permission: string) =>
    hasPermission(permissions, permission);

  it('★ SUPER_ADMIN HAMMA BOʻLIMNI KOʻRADI', () => {
    expect(visibleNavItems(can(['*']))).toHaveLength(NAV_ITEMS.length);
  });

  it('★ MODERATOR MOLIYA BOʻLIMINI KOʻRMAYDI', () => {
    // Moderator huquqlari: hujjat verifikatsiyasi va foydalanuvchilar
    const items = visibleNavItems(can(['docs.verify', 'users.view', 'users.ban']));
    const paths = items.map((item) => item.path);

    expect(paths).toContain('/verifications');
    expect(paths).toContain('/users');
    expect(paths).not.toContain('/payouts');
    expect(paths).not.toContain('/ledger');
    expect(paths).not.toContain('/settings');
    expect(paths).not.toContain('/audit');
  });

  it('★ FINANCE FAQAT MOLIYANI KOʻRADI', () => {
    const items = visibleNavItems(can(['payments.view', 'payouts.process']));
    const groups = new Set(items.map((item) => item.group));

    expect(groups).toEqual(new Set(['moliya']));
  });

  it('huquqsiz admin boʻsh menyu koʻradi', () => {
    expect(visibleNavItems(can([]))).toEqual([]);
  });

  it('★ HAR BIR BOʻLIMDA HUQUQ VA GURUH BOR', () => {
    // Huquqsiz bo'lim hamma uchun ko'rinadi va bu himoyani chetlab
    // o'tgandek tuyuladi; guruhsiz bo'lim esa menyudan tushib qoladi
    for (const item of NAV_ITEMS) {
      expect(item.permission, `${item.path} — huquq yoʻq`).toBeTruthy();
      expect(item.permission).toContain('.');
      expect(GROUP_LABELS[item.group], `${item.path} — guruh nomi yoʻq`).toBeTruthy();
    }
  });

  it('★ MANZILLAR TAKRORLANMAYDI', () => {
    // Ikkita bir xil `path` — router'da birinchisi g'olib bo'ladi va
    // ikkinchisi hech qachon ochilmaydi
    const paths = NAV_ITEMS.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

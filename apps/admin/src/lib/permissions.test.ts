import { describe, expect, it } from 'vitest';

import { hasPermission } from './permissions';

/**
 * Huquq mantiqi — backend `admin.guard.ts` bilan AYNAN bir xil bo'lishi
 * shart.
 *
 * Bu testlar backenddagi `hasPermission` ning holatlarini takrorlaydi.
 * Ular yiqilsa, panel serverdan qattiqroq yoki yumshoqroq bo'lib
 * qolgan degani: birinchi holatda operator ishini qila olmaydi,
 * ikkinchisida 403 beradigan tugmani bosadi.
 */
describe('hasPermission', () => {
  it('★ "*" HAMMA NARSAGA RUXSAT BERADI', () => {
    // SUPER_ADMIN roli aynan shunday saqlanadi
    expect(hasPermission(['*'], 'payouts.process')).toBe(true);
    expect(hasPermission(['*'], 'settings.update')).toBe(true);
    expect(hasPermission(['*'], 'butunlay.yangi.huquq')).toBe(true);
  });

  it('aniq moslik ishlaydi', () => {
    expect(hasPermission(['docs.verify'], 'docs.verify')).toBe(true);
    expect(hasPermission(['docs.verify'], 'docs.delete')).toBe(false);
  });

  it('★ GURUH JOKERI ("users.*") QOʻLLAB-QUVVATLANADI', () => {
    // Backend buni qo'llab-quvvatlaydi. Bu yerda unutilsa, moderator
    // o'zi bajarishi mumkin bo'lgan amalni umuman ko'rmaydi — va
    // hech qanday xato chiqmaydi, shunchaki tugma yo'q bo'ladi
    expect(hasPermission(['users.*'], 'users.ban')).toBe(true);
    expect(hasPermission(['users.*'], 'users.view')).toBe(true);
    expect(hasPermission(['users.*'], 'payments.view')).toBe(false);
  });

  it('boshqa guruhning jokeri ruxsat bermaydi', () => {
    expect(hasPermission(['payments.*'], 'users.ban')).toBe(false);
  });

  it('bo‘sh ro‘yxat hech narsaga ruxsat bermaydi', () => {
    expect(hasPermission([], 'dashboard.view')).toBe(false);
  });

  it('★ NUQTASIZ HUQUQ NOMI YIQITMAYDI', () => {
    // `required.split('.')[0]` — nuqtasiz nomda butun satrni qaytaradi.
    // `noUncheckedIndexedAccess` yoqilgani uchun bu joy `undefined`
    // bo'lishi mumkin deb hisoblanadi va tekshirilgan
    expect(hasPermission(['dashboard'], 'dashboard')).toBe(true);
    expect(hasPermission(['boshqa'], 'dashboard')).toBe(false);
  });
});

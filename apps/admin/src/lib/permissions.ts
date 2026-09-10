/**
 * Huquq tekshiruvi — backend `admin.guard.ts` dagi `hasPermission` NING
 * AYNAN NUSXASI.
 *
 * NEGA NUSXA, VA BU XAVFLI EMASMI:
 *
 *   Frontend tekshiruvi HIMOYA EMAS. Haqiqiy tekshiruv har doim
 *   serverda: `@RequirePermission('payments.payout')` guard'i tokenni va
 *   huquqni qayta ko'radi. Bu yerdagi funksiya faqat INTERFEYS uchun —
 *   operatorga bosgan zahoti "huquq yo'q" xatosini beradigan tugmani
 *   ko'rsatmaslik kerak.
 *
 *   Lekin mantiq AYNAN bir xil bo'lishi shart. Agar bu yerda `"users.*"`
 *   qo'llab-quvvatlanmasa, moderator o'zi bajarishi mumkin bo'lgan
 *   amalni umuman ko'rmaydi — panel serverdan qattiqroq bo'lib qoladi
 *   va buni hech kim sezmaydi (xato yo'q, shunchaki tugma yo'q).
 *
 * Qoidalar:
 *   `"*"`        — hamma narsa (SUPER_ADMIN)
 *   `"users.*"`  — `users` guruhidagi hamma amal
 *   `"users.ban"` — aniq moslik
 */
export function hasPermission(permissions: readonly string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;

  const group = required.split('.')[0];
  return group !== undefined && permissions.includes(`${group}.*`);
}

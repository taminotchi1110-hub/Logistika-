/**
 * Oʻzbekiston telefon raqamlari bilan ishlash.
 *
 * Foydalanuvchi raqamni juda xilma-xil kiritadi:
 *   90 123 45 67 · +998 90 123-45-67 · 998901234567 · 8 90 123 45 67
 * Bazada esa faqat BITTA kanonik shakl boʻlishi kerak: E.164 → +998901234567.
 * Aks holda bitta odam bir necha akkaunt ochib yuboradi.
 */

/** Amaldagi mobil operator kodlari (2026). Yangi kod chiqsa shu yerga qoʻshiladi. */
export const UZ_MOBILE_PREFIXES = [
  '20', // Uzmobile (yangi)
  '33', // Humans
  '50', // Perfectum / Uzmobile
  '55', // Uzmobile
  '77', // Uztelecom
  '88', // Humans / Uzmobile
  '90', // Beeline
  '91', // Beeline
  '93', // Ucell
  '94', // Ucell
  '95', // Uzmobile
  '97', // Mobiuz
  '98', // Uzmobile
  '99', // Uzmobile
] as const;

const E164_UZ = /^\+998\d{9}$/;

/**
 * Har qanday koʻrinishdagi raqamni E.164 ga keltiradi.
 * Keltirib boʻlmasa `null` qaytaradi — chaqiruvchi tomon xato beradi.
 */
export function normalizeUzPhone(input: string): string | null {
  if (!input) return null;

  // Barcha ajratgichlarni olib tashlaymiz: bo'shliq, qavs, tire, nuqta
  let digits = input.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) digits = digits.slice(1);

  // 8 dan boshlangan eski format: 8 90 123 45 67 → 90 123 45 67
  if (digits.length === 10 && digits.startsWith('8')) digits = digits.slice(1);

  // Mamlakat kodisiz kiritilgan: 901234567
  if (digits.length === 9) digits = `998${digits}`;

  if (digits.length !== 12 || !digits.startsWith('998')) return null;

  const prefix = digits.slice(3, 5);
  if (!UZ_MOBILE_PREFIXES.includes(prefix as (typeof UZ_MOBILE_PREFIXES)[number])) return null;

  const phone = `+${digits}`;
  return E164_UZ.test(phone) ? phone : null;
}

export function isValidUzPhone(input: string): boolean {
  return normalizeUzPhone(input) !== null;
}

/**
 * Raqamni maskalaydi: +998901234567 → +998 90 *** ** 67
 * Buyurtma tasdiqlangunga qadar tomonlar bir-birining raqamini koʻrmaydi —
 * bu platformani chetlab oʻtishning oldini oladigan asosiy chora.
 */
export function maskPhone(phone: string): string {
  const normalized = normalizeUzPhone(phone);
  if (!normalized) return '***';
  const operator = normalized.slice(4, 6);
  const last = normalized.slice(-2);
  return `+998 ${operator} *** ** ${last}`;
}

/** Log va xato xabarlarida toʻliq raqam chiqmasligi uchun. */
export function redactPhone(phone: string): string {
  return maskPhone(phone);
}

import { parseTiyin, sumTiyin } from '@/lib/money';

/**
 * Pul yechish so'rovlari.
 *
 * BU EKRANDA HAQIQIY PUL HARAKAT QILADI. "Bajarildi" bosilgandan keyin
 * pul haydovchining hamyonidan chiqib ketgan hisoblanadi va uni
 * qaytarish qo'lda tuzatishni talab qiladi.
 */

export interface Payout {
  id: string;
  amountTiyin: string;
  cardMask: string | null;
  status: string;
  requestedAt: string;
  driverId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export interface LedgerIntegrity {
  ok: boolean;
  mismatches: { accountId: string; stored: string; computed: string }[];
}

/**
 * Navbat jami.
 *
 * Operator bankka o'tishdan oldin "bugun qancha pul kerak?" degan
 * savolga javob oladi. `BigInt` bilan: yig'indi juda katta bo'lishi
 * mumkin va `Number` da oxirgi tiyinlar yo'qolardi.
 */
export function payoutTotal(payouts: Payout[]): string {
  return sumTiyin(payouts.map((payout) => payout.amountTiyin));
}

/**
 * So'rov qancha kutgan — SOATDA.
 *
 * Pul yechish kutish vaqti eng ko'p shikoyat sababi. 24 soatdan
 * oshgani alohida belgilanadi: haydovchi uchun bu "pulim yo'qoldi"
 * degani va u qo'llab-quvvatlashga yozadi.
 */
export function waitingHours(requestedAt: string, now: Date = new Date()): number {
  const requested = new Date(requestedAt).getTime();
  if (Number.isNaN(requested)) return 0;
  return Math.max(0, Math.floor((now.getTime() - requested) / 3_600_000));
}

export function isOverdue(requestedAt: string, now: Date = new Date()): boolean {
  return waitingHours(requestedAt, now) >= 24;
}

export function waitingLabel(requestedAt: string, now: Date = new Date()): string {
  const hours = waitingHours(requestedAt, now);
  if (hours < 1) return 'hozir';
  if (hours < 24) return `${hours} soat kutmoqda`;
  return `${Math.floor(hours / 24)} kun kutmoqda`;
}

/**
 * Bank tranzaksiya raqami to'g'rimi.
 *
 * SERVER UNI IXTIYORIY QILADI va bo'sh bo'lsa `"MANUAL"` yozib qo'yadi.
 * Interfeys esa uni MAJBURIY qiladi. Sabab: bu raqam bizning
 * ledgerimiz bilan bank ko'chirmasi o'rtasidagi yagona bog'lanish.
 * Usiz oyning oxirida "bu 4 million qayerga ketdi?" degan savolga
 * javob topib bo'lmaydi.
 *
 * Agar haqiqatan ham raqam bo'lmasa, operator `MANUAL` deb o'zi
 * yozadi — shunda bu ATAYLAB qilingan ish bo'ladi va auditda
 * shundayligicha ko'rinadi, jimgina qo'yilgan standart qiymat emas.
 */
export function isValidTxnId(value: string): boolean {
  return value.trim().length >= 3;
}

/** Nomuvofiqlik hajmi — ledger buzilganda qancha farq borligini ko'rsatish uchun. */
export function mismatchDelta(mismatch: { stored: string; computed: string }): string {
  return (parseTiyin(mismatch.stored) - parseTiyin(mismatch.computed)).toString();
}

import { createHash } from 'node:crypto';

/**
 * Click Merchant API — protokol qismi (sof funksiyalar).
 *
 * Click ikki bosqichli sxema bilan ishlaydi va BIZNING serverimizga
 * so'rov yuboradi (biz Click'ga emas):
 *
 *   1. **Prepare** (`action=0`) — "shu to'lovni qabul qila olasizmi?"
 *      Biz `merchant_prepare_id` qaytaramiz.
 *   2. **Complete** (`action=1`) — "pul yechildi, tasdiqlang."
 *      Biz `merchant_confirm_id` qaytaramiz va hamyonni to'ldiramiz.
 *
 * NEGA IKKI BOSQICH: birinchi bosqichda biz to'lovni tekshiramiz
 * (summa to'g'rimi, hisob bormi) va Click foydalanuvchidan pul yechishdan
 * OLDIN xato qaytara olamiz. Aks holda pul yechilib, keyin "hisob
 * topilmadi" chiqardi va qaytarish kerak bo'lardi.
 *
 * Hujjat: https://docs.click.uz/click-api-request/
 */

/** Click kutadigan xato kodlari — o'zgartirib bo'lmaydi. */
export const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  FAILED_TO_UPDATE_USER: -7,
  ERROR_IN_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
} as const;

export const CLICK_ACTION = {
  PREPARE: 0,
  COMPLETE: 1,
} as const;

export interface ClickRequest {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id?: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  error?: string;
  error_note?: string;
  sign_time: string;
  sign_string: string;
}

export interface ClickResponse {
  click_trans_id: number;
  merchant_trans_id: string;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number;
  error: number;
  error_note: string;
}

/** Kod bo'yicha standart izoh — Click loglarida shu ko'rinadi. */
export const CLICK_ERROR_NOTE: Record<number, string> = {
  [CLICK_ERROR.SUCCESS]: 'Success',
  [CLICK_ERROR.SIGN_CHECK_FAILED]: 'SIGN CHECK FAILED!',
  [CLICK_ERROR.INCORRECT_AMOUNT]: 'Incorrect parameter amount',
  [CLICK_ERROR.ACTION_NOT_FOUND]: 'Action not found',
  [CLICK_ERROR.ALREADY_PAID]: 'Already paid',
  [CLICK_ERROR.USER_NOT_FOUND]: 'User does not exist',
  [CLICK_ERROR.TRANSACTION_NOT_FOUND]: 'Transaction does not exist',
  [CLICK_ERROR.FAILED_TO_UPDATE_USER]: 'Failed to update user',
  [CLICK_ERROR.ERROR_IN_REQUEST]: 'Error in request from click',
  [CLICK_ERROR.TRANSACTION_CANCELLED]: 'Transaction cancelled',
};

/**
 * Imzoni hisoblaydi.
 *
 * Prepare:  md5(click_trans_id + service_id + SECRET + merchant_trans_id + amount + action + sign_time)
 * Complete: md5(click_trans_id + service_id + SECRET + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 *
 * MUHIM: `amount` AYNAN Click yuborgan ko'rinishda qo'shiladi
 * ("1000.00" va "1000" turli imzo beradi). Shuning uchun uni
 * son sifatida qayta formatlamaymiz.
 */
export function clickSignature(
  request: Pick<
    ClickRequest,
    'click_trans_id' | 'service_id' | 'merchant_trans_id' | 'merchant_prepare_id' | 'amount' | 'action' | 'sign_time'
  >,
  secretKey: string,
): string {
  const isComplete = String(request.action) === String(CLICK_ACTION.COMPLETE);

  const parts = [
    request.click_trans_id,
    request.service_id,
    secretKey,
    request.merchant_trans_id,
    ...(isComplete ? [request.merchant_prepare_id ?? ''] : []),
    request.amount,
    request.action,
    request.sign_time,
  ];

  return createHash('md5').update(parts.join('')).digest('hex');
}

/**
 * Imzoni tekshiradi.
 *
 * Doimiy vaqtli solishtirish ATAYLAB ishlatilmagan: bu MD5 xesh, maxfiy
 * emas — Click uni ochiq yuboradi. Timing attack bilan olinadigan
 * ma'lumot yo'q, chunki hujumchi xeshni allaqachon biladi.
 */
export function verifyClickSignature(request: ClickRequest, secretKey: string): boolean {
  const expected = clickSignature(request, secretKey);
  return expected === String(request.sign_string ?? '').toLowerCase();
}

/**
 * Click summani SO'MDA yuboradi ("1000.00"), biz esa tiyinda saqlaymiz.
 *
 * Suzuvchi nuqta ishlatilmaydi: satr sifatida bo'lib, kasr qismini
 * ikki xonagacha to'ldiramiz. `parseFloat("1000.10") * 100` ba'zi
 * qiymatlarda 100009.99999 beradi.
 */
export function clickAmountToTiyin(amount: string): bigint | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(amount).trim());
  if (!match) return null;

  const soum = BigInt(match[1]);
  const tiyin = BigInt((match[2] ?? '0').padEnd(2, '0'));

  return soum * 100n + tiyin;
}

/** Tiyinni Click kutadigan so'm ko'rinishiga o'giradi. */
export function tiyinToClickAmount(tiyin: bigint): string {
  const soum = tiyin / 100n;
  const rest = tiyin % 100n;
  return `${soum}.${rest.toString().padStart(2, '0')}`;
}

export function clickError(code: number, merchantTransId: string, clickTransId: number): ClickResponse {
  return {
    click_trans_id: clickTransId,
    merchant_trans_id: merchantTransId,
    error: code,
    error_note: CLICK_ERROR_NOTE[code] ?? 'Unknown error',
  };
}

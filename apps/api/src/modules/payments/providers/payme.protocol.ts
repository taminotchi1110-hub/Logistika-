import { timingSafeEqual } from 'node:crypto';

/**
 * Payme Merchant API — protokol qismi (sof funksiyalar).
 *
 * Payme JSON-RPC 2.0 ishlatadi va BIZNING bitta endpointimizga
 * har xil `method` bilan murojaat qiladi. Autentifikatsiya —
 * HTTP Basic: `Paycom:{MERCHANT_KEY}`.
 *
 * TRANZAKSIYA HOLATLARI (Payme terminologiyasi):
 *    1  — yaratildi, kutilmoqda
 *    2  — bajarildi (pul yechildi)
 *   -1  — bekor qilindi (bajarilishidan oldin)
 *   -2  — bekor qilindi (bajarilgandan keyin, ya'ni qaytarildi)
 *
 * MUHIM: Payme HAR DOIM HTTP 200 kutadi. Xato JSON-RPC javobining
 * `error` maydonida qaytariladi. 500 qaytarsak Payme uni "aloqa uzildi"
 * deb hisoblaydi va so'rovni qayta-qayta yuboraveradi.
 *
 * Hujjat: https://developer.help.paycom.uz/metody-merchant-api/
 */

export const PAYME_STATE = {
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED_BEFORE_PERFORM: -1,
  CANCELLED_AFTER_PERFORM: -2,
} as const;

export const PAYME_ERROR = {
  /** Autentifikatsiya xatosi — noto'g'ri kalit. */
  INSUFFICIENT_PRIVILEGE: -32504,
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  /** Summa noto'g'ri. */
  INVALID_AMOUNT: -31001,
  /** Tranzaksiya topilmadi. */
  TRANSACTION_NOT_FOUND: -31003,
  /** Amalni bajarib bo'lmaydi (holat mos emas yoki muddat o'tgan). */
  UNABLE_TO_PERFORM: -31008,
  /** Bekor qilib bo'lmaydi (xizmat ko'rsatilgan). */
  UNABLE_TO_CANCEL: -31007,
  /** Maxsus xatolar oralig'i: -31099 … -31050. */
  ORDER_NOT_FOUND: -31050,
  ORDER_ALREADY_PAID: -31051,
  ORDER_STATE_INVALID: -31052,
} as const;

/**
 * Payme uch tilda xabar kutadi. Mijoz ilovasi bu matnni EMAS, kodni
 * ishlatadi — bu matn Payme ilovasida foydalanuvchiga ko'rsatiladi.
 */
export interface PaymeErrorMessage {
  uz: string;
  ru: string;
  en: string;
}

export const PAYME_ERROR_MESSAGE: Record<number, PaymeErrorMessage> = {
  [PAYME_ERROR.INSUFFICIENT_PRIVILEGE]: {
    uz: 'Ruxsat yoʻq',
    ru: 'Недостаточно привилегий',
    en: 'Insufficient privilege',
  },
  [PAYME_ERROR.INVALID_AMOUNT]: {
    uz: 'Notoʻgʻri summa',
    ru: 'Неверная сумма',
    en: 'Invalid amount',
  },
  [PAYME_ERROR.TRANSACTION_NOT_FOUND]: {
    uz: 'Tranzaksiya topilmadi',
    ru: 'Транзакция не найдена',
    en: 'Transaction not found',
  },
  [PAYME_ERROR.UNABLE_TO_PERFORM]: {
    uz: 'Amalni bajarib boʻlmaydi',
    ru: 'Невозможно выполнить операцию',
    en: 'Unable to perform operation',
  },
  [PAYME_ERROR.UNABLE_TO_CANCEL]: {
    uz: 'Bekor qilib boʻlmaydi',
    ru: 'Невозможно отменить',
    en: 'Unable to cancel',
  },
  [PAYME_ERROR.ORDER_NOT_FOUND]: {
    uz: 'Toʻlov topilmadi',
    ru: 'Платёж не найден',
    en: 'Payment not found',
  },
  [PAYME_ERROR.ORDER_ALREADY_PAID]: {
    uz: 'Toʻlov allaqachon amalga oshirilgan',
    ru: 'Платёж уже произведён',
    en: 'Payment already made',
  },
  [PAYME_ERROR.ORDER_STATE_INVALID]: {
    uz: 'Toʻlov holati mos emas',
    ru: 'Неверное состояние платежа',
    en: 'Invalid payment state',
  },
  [PAYME_ERROR.METHOD_NOT_FOUND]: {
    uz: 'Metod topilmadi',
    ru: 'Метод не найден',
    en: 'Method not found',
  },
};

export interface PaymeRpcRequest {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

export interface PaymeRpcSuccess {
  jsonrpc: '2.0';
  id: number | string | null;
  result: Record<string, unknown>;
}

export interface PaymeRpcFailure {
  jsonrpc: '2.0';
  id: number | string | null;
  error: { code: number; message: PaymeErrorMessage; data?: string };
}

export function paymeSuccess(
  id: number | string | null | undefined,
  result: Record<string, unknown>,
): PaymeRpcSuccess {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

export function paymeFailure(
  id: number | string | null | undefined,
  code: number,
  data?: string,
): PaymeRpcFailure {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message: PAYME_ERROR_MESSAGE[code] ?? {
        uz: 'Xatolik',
        ru: 'Ошибка',
        en: 'Error',
      },
      ...(data ? { data } : {}),
    },
  };
}

/**
 * `Authorization: Basic base64("Paycom:KEY")` ni tekshiradi.
 *
 * Bu YERDA doimiy vaqtli solishtirish SHART: kalit maxfiy va faqat
 * Payme biladi. Oddiy `===` bilan solishtirilsa, hujumchi javob
 * vaqtidagi mikrosoniyalik farq orqali kalitni belgima-belgi topa oladi.
 */
export function verifyPaymeAuth(header: string | undefined, merchantKey: string): boolean {
  if (!header?.startsWith('Basic ')) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }

  const separator = decoded.indexOf(':');
  if (separator === -1) return false;

  const login = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  if (login !== 'Paycom') return false;

  const provided = Buffer.from(password, 'utf8');
  const expected = Buffer.from(merchantKey, 'utf8');

  // `timingSafeEqual` uzunliklar teng bo'lishini talab qiladi
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}

/**
 * Payme `account` obyektidan to'lov ID'sini oladi.
 *
 * Payme kabinetida "hisob maydoni" sozlanadi; bizda u `payment_id`.
 * Kalit nomi noto'g'ri kelsa `null` qaytadi va biz `ORDER_NOT_FOUND`
 * beramiz — bu Payme integratsiyasini sozlashdagi eng ko'p uchraydigan
 * xato va uni aniq xato kodi bilan ko'rsatish sozlashni tezlashtiradi.
 */
export function extractPaymentId(params: Record<string, unknown> | undefined): string | null {
  const account = params?.account;
  if (!account || typeof account !== 'object') return null;

  const value = (account as Record<string, unknown>).payment_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Payme vaqtni millisekundlarda yuboradi. */
export function paymeTime(date: Date | null | undefined): number {
  return date ? date.getTime() : 0;
}

/**
 * Tranzaksiyani bajarish uchun berilgan muddat.
 *
 * Payme qoidasi: `CreateTransaction` dan 12 soat o'tsa va
 * `PerformTransaction` kelmasa, biz uni bekor qilishimiz va
 * `UNABLE_TO_PERFORM` qaytarishimiz kerak.
 */
export const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export function isPaymeTimedOut(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() > PAYME_TIMEOUT_MS;
}

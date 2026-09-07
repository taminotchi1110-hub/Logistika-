import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';

/**
 * Keyset (cursor) pagination.
 *
 * NEGA OFFSET EMAS:
 *  1. `OFFSET 10000` bazani 10 000 qatorni oʻqib tashlashga majbur qiladi —
 *     sahifa raqami oshgani sari sekinlashadi.
 *  2. Lenta doim yangilanadi: siz 2-sahifaga oʻtguningizcha yangi yuk qoʻshilsa,
 *     bir eʼlonni ikki marta koʻrasiz yoki bittasini umuman koʻrmaysiz.
 * Keyset ikkalasini ham yechadi: "oxirgi koʻrgan qiymatdan keyingisini ber".
 *
 * Kursor **noaniq** (opaque) boʻlishi kerak — mijoz uni ochib oʻzgartirmasligi
 * uchun base64url'ga oʻraladi. Bu himoya emas, shartnoma: ichki tuzilishni
 * keyin oʻzgartira olamiz.
 */
export interface CursorPayload {
  /** Tartiblash maydonining qiymati (sana ISO, son yoki matn). */
  v: string | number;
  /** Bir xil qiymatli qatorlarni ajratish uchun — har doim unikal. */
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('v' in parsed) ||
      !('id' in parsed) ||
      typeof (parsed as CursorPayload).id !== 'string'
    ) {
      throw new Error('shakl notoʻgʻri');
    }
    return parsed as CursorPayload;
  } catch {
    throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Kursor yaroqsiz');
  }
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * `limit + 1` qator soʻralgan boʻlishi kerak: ortiqcha qator "yana bor" degani.
 * Shu tufayli `COUNT(*)` qilish shart emas — bu katta jadvalda qimmat soʻrov.
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => CursorPayload,
): PageResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null,
  };
}

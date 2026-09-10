/**
 * Foydalanuvchilar bo'limi ma'lumotlari.
 */

export type UserRole = 'SHIPPER' | 'DRIVER' | 'BOTH';
export type UserStatus = 'PENDING_PROFILE' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';

export interface UserRow {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  status: UserStatus;
  /** NUMERIC — server satr qaytaradi (aniqlik yo'qolmasin). */
  ratingAvg: string;
  ratingCount: number;
  completedOrders: number;
  cancelledOrders: number;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface UserDetail {
  user: Omit<UserRow, 'lastSeenAt'>;
  wallet: { balanceTiyin: string; formatted: string };
  ordersCount: number;
  documents: {
    id: string;
    type: string;
    verificationStatus: string;
    createdAt: string;
  }[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SHIPPER: 'Yuk beruvchi',
  DRIVER: 'Haydovchi',
  BOTH: 'Ikkalasi',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  PENDING_PROFILE: 'Profil toʻldirilmagan',
  ACTIVE: 'Faol',
  SUSPENDED: 'Vaqtincha toʻxtatilgan',
  BANNED: 'Bloklangan',
  DELETED: 'Oʻchirilgan',
};

/** Status rangi — ro'yxatda holatni ko'z bilan ajratish uchun. */
export function statusTone(status: UserStatus): 'ok' | 'warn' | 'danger' | 'muted' {
  switch (status) {
    case 'ACTIVE':
      return 'ok';
    case 'SUSPENDED':
      return 'warn';
    case 'BANNED':
    case 'DELETED':
      return 'danger';
    default:
      return 'muted';
  }
}

export function fullName(user: { firstName: string | null; lastName: string | null }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || 'Ism koʻrsatilmagan';
}

/**
 * Reyting.
 *
 * BAHOSIZ FOYDALANUVCHIDA "0.0" EMAS, "—".
 *
 * `rating_avg` bahosiz foydalanuvchida 0 bo'ladi. Uni "0.0 ★" deb
 * ko'rsatish — yangi haydovchini eng yomon baholangan qilib ko'rsatish
 * demak. Operator uni shu asosda bloklashi mumkin, holbuki u
 * shunchaki hali ishlamagan.
 */
export function formatRating(ratingAvg: string, ratingCount: number): string {
  if (ratingCount === 0) return '—';

  // BO'SH SATR ALOHIDA TEKSHIRILADI: `Number('')` — bu 0, `NaN` emas.
  // `Number.isFinite` uni o'tkazib yuboradi va ma'lumot yo'qligi
  // "0.0 ★" bo'lib ko'rinadi. Bu JavaScript'ning eng jim tuzoqlaridan
  // biri va uni test ushlab oldi.
  if (ratingAvg.trim() === '') return '—';

  const value = Number(ratingAvg);
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} (${ratingCount})`;
}

/**
 * Bekor qilish ulushi — foizda.
 *
 * Support uchun asosiy signal: buyurtmalarning yarmini bekor qiladigan
 * haydovchi tizimga zarar keltiradi. Lekin 1 tadan 1 tasi bekor
 * qilingan bo'lsa, bu 100% — va u hech narsani anglatmaydi. Shuning
 * uchun kamida 5 ta yakuniy holat bo'lishi kerak.
 */
export function cancelRate(user: {
  completedOrders: number;
  cancelledOrders: number;
}): number | null {
  const total = user.completedOrders + user.cancelledOrders;
  if (total < 5) return null;
  return Math.round((user.cancelledOrders / total) * 100);
}

/**
 * Blok qilish uchun sabab majburiymi.
 *
 * `ACTIVE` ga qaytarish — blokni ochish, unga sabab shart emas.
 * Bloklash esa foydalanuvchining BARCHA SESSIYALARINI bir zumda
 * bekor qiladi (`token_version` oshadi) va u ilovadan uchib tushadi.
 * U qo'llab-quvvatlashga murojaat qiladi, operator esa sababni
 * auditdan o'qiy olishi kerak.
 */
export function reasonRequired(status: UserStatus): boolean {
  return status !== 'ACTIVE';
}

/** Sana — `2026-09-10` ko'rinishida. Vaqt kerak emas: ro'yxat kunlik aniqlikda o'qiladi. */
export function shortDateTime(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

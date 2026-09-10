import { parseTiyin, tiyinToSoum } from '@/lib/money';

/**
 * Boshqaruv paneli ma'lumotlari.
 *
 * Pul bilan ishlash qoidalari `lib/money.ts` da — u butun panel uchun
 * yagona joy. Bu yerda faqat grafik uchun shakl berish.
 */

export interface DashboardStats {
  users: { total: number; drivers: number; shippers: number; newToday: number };
  orders: { total: number; active: number; completed: number; today: number };
  revenue: {
    totalTiyin: string;
    totalFormatted: string;
    todayTiyin: string;
    todayFormatted: string;
    monthTiyin: string;
    monthFormatted: string;
  };
  activeLoads: number;
  pendingVerifications: number;
}

export interface SeriesPoint {
  date: string;
  created: number;
  cancelled: number;
  completed: number;
  gmvTiyin: string;
  commissionTiyin: string;
}

/** Grafikda ishlatiladigan nuqta — pul so'mda va `number` sifatida. */
export interface ChartPoint {
  date: string;
  /** `12 sen` ko'rinishidagi qisqa yorliq. */
  label: string;
  created: number;
  cancelled: number;
  completed: number;
  gmvSoum: number;
  commissionSoum: number;
}

const MONTHS = [
  'yan',
  'fev',
  'mar',
  'apr',
  'may',
  'iyn',
  'iyl',
  'avg',
  'sen',
  'okt',
  'noy',
  'dek',
];

/**
 * `2026-09-12` → `12 sen`.
 *
 * `Date` ISHLATILMAYDI: `new Date('2026-09-12')` ni brauzer UTC deb
 * o'qiydi va manfiy siljishli zonalarda kun bir kunga orqaga ketadi.
 * Server allaqachon Toshkent sanasini yuborgan — uni qayta talqin
 * qilishning ma'nosi yo'q.
 */
export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  if (!month || !day) return isoDate;
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month}`;
}

export function toChartPoints(series: SeriesPoint[]): ChartPoint[] {
  return series.map((point) => ({
    date: point.date,
    label: shortDate(point.date),
    created: point.created,
    cancelled: point.cancelled,
    completed: point.completed,
    gmvSoum: tiyinToSoum(point.gmvTiyin),
    commissionSoum: tiyinToSoum(point.commissionTiyin),
  }));
}

/**
 * Oraliq bo'yicha yig'indi — grafik ostidagi qatorlar uchun.
 *
 * Ular KPI kartalarni TAKRORLAMAYDI: kartalar "hozirgi holat"
 * (jami, bugun, oy), bu esa "tanlangan oraliqda". Operator 7 kunni
 * tanlab, "shu haftada nima bo'ldi?" degan savolga javob oladi.
 */
export function summarize(series: SeriesPoint[]): {
  created: number;
  completed: number;
  cancelled: number;
  gmvTiyin: string;
  commissionTiyin: string;
  /** Yakunlangan / yaratilgan — foizda. */
  completionRate: number;
} {
  let created = 0;
  let completed = 0;
  let cancelled = 0;
  let gmv = 0n;
  let commission = 0n;

  for (const point of series) {
    created += point.created;
    completed += point.completed;
    cancelled += point.cancelled;
    gmv += parseTiyin(point.gmvTiyin);
    commission += parseTiyin(point.commissionTiyin);
  }

  return {
    created,
    completed,
    cancelled,
    gmvTiyin: gmv.toString(),
    commissionTiyin: commission.toString(),
    // Nolga bo'lish: yangi platformada yoki bo'sh oraliqda buyurtma
    // umuman bo'lmasligi mumkin va `NaN%` ko'rsatish xato ko'rinadi
    completionRate: created === 0 ? 0 : Math.round((completed / created) * 100),
  };
}

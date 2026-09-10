import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Alert, Card } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

import { formatSoum } from '@/lib/money';

import { summarize, toChartPoints, type DashboardStats, type SeriesPoint } from './metrics';

/**
 * Boshqaruv paneli.
 *
 * IKKI SO'ROV, BITTA EMAS: KPI kartalar bir nechta `COUNT` dan keladi
 * va tez, dinamika esa oraliq bo'yicha skanerlash — sekinroq. Bitta
 * so'rovda birlashtirilsa, kartalar eng sekin qismini kutib turardi.
 * Alohida bo'lgani uchun raqamlar darhol chiqadi, grafik esa keyin
 * to'ldiriladi.
 */

const RANGES = [
  { days: 7, label: '7 kun' },
  { days: 30, label: '30 kun' },
  { days: 90, label: '90 kun' },
];

export function DashboardPage() {
  const { can } = useSession();
  const [days, setDays] = useState(30);

  const stats = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/admin/dashboard'),
  });

  const series = useQuery({
    queryKey: ['dashboard-series', days],
    queryFn: () => api.get<SeriesPoint[]>('/admin/dashboard/series', { days }),
    // Oraliq almashtirilganda eski grafik ekranda qoladi va yangisi
    // ustiga keladi — bo'sh joy "sakramaydi"
    placeholderData: (previous) => previous,
  });

  if (stats.isError) {
    return (
      <Alert>
        {stats.error instanceof ApiError ? stats.error.message : 'Maʼlumotni yuklab boʻlmadi'}
      </Alert>
    );
  }

  const points = toChartPoints(series.data ?? []);
  const totals = summarize(series.data ?? []);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Boshqaruv paneli</h1>

      {/* --- ogohlantirishlar eng tepada: ular ish talab qiladi --- */}
      {stats.data && stats.data.pendingVerifications > 0 ? (
        <div className="mb-4">
          <Alert tone="warn">
            <Link to="/verifications" className="font-medium underline">
              {stats.data.pendingVerifications} ta yozuv tekshirishni kutmoqda
            </Link>{' '}
            — haydovchi tasdiqlanmaguncha ishga chiqa olmaydi.
          </Alert>
        </div>
      ) : null}

      {/* --- KPI kartalar --- */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Foydalanuvchilar"
          value={stats.data ? String(stats.data.users.total) : '—'}
          hint={
            stats.data
              ? `${stats.data.users.drivers} haydovchi · ${stats.data.users.shippers} yuk beruvchi`
              : ''
          }
          delta={stats.data ? `bugun +${stats.data.users.newToday}` : ''}
        />
        <Kpi
          label="Faol buyurtmalar"
          value={stats.data ? String(stats.data.orders.active) : '—'}
          hint={stats.data ? `jami ${stats.data.orders.total}` : ''}
          delta={stats.data ? `bugun +${stats.data.orders.today}` : ''}
        />
        <Kpi
          label="Faol yuklar"
          value={stats.data ? String(stats.data.activeLoads) : '—'}
          hint="eʼlon qilingan va haydovchi kutayotgan"
        />
        <Kpi
          label="Platforma daromadi"
          // Serverning FORMATLANGAN qiymati: u `BigInt` bilan hisoblangan
          // va yaxlitlash xatosi yo'q
          value={stats.data ? stats.data.revenue.monthFormatted : '—'}
          hint={stats.data ? `bugun ${stats.data.revenue.todayFormatted}` : ''}
          delta="shu oyda"
        />
      </div>

      {/* --- oraliq tanlash --- */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold text-slate-800">Dinamika</h2>
        <div className="ml-auto flex gap-1">
          {RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              aria-pressed={days === range.days}
              className={clsx(
                'rounded-lg px-3 py-1 text-sm transition',
                days === range.days
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {series.isError ? (
        <Alert>
          {series.error instanceof ApiError ? series.error.message : 'Dinamikani yuklab boʻlmadi'}
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-1 text-sm font-medium text-slate-700">Buyurtmalar</h3>
            <p className="mb-3 text-xs text-slate-500">
              {totals.created} yaratildi · {totals.completed} yakunlandi ·{' '}
              {totals.cancelled} bekor qilindi · yakunlanish {totals.completionRate}%
            </p>
            <ChartFrame empty={points.length === 0}>
              <LineChart data={points}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip />
                {/* `dot={false}` — 90 kunda nuqtalar chiziqni bosib ketadi */}
                <Line
                  type="monotone"
                  dataKey="created"
                  name="Yaratildi"
                  stroke="#3563e9"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Yakunlandi"
                  stroke="#0f8a5f"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cancelled"
                  name="Bekor qilindi"
                  stroke="#b42318"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartFrame>
          </Card>

          <Card>
            <h3 className="mb-1 text-sm font-medium text-slate-700">Aylanma va komissiya</h3>
            <p className="mb-3 text-xs text-slate-500">
              GMV {formatSoum(totals.gmvTiyin)} · komissiya {formatSoum(totals.commissionTiyin)}
            </p>
            <ChartFrame empty={points.length === 0}>
              {/* Ustunlar, chiziq emas: kunlik summa uzluksiz kattalik
                  emas — ikki kun orasida "oraliq qiymat" yo'q */}
              <BarChart data={points}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70} />
                <Tooltip formatter={(value: number) => `${value.toLocaleString('ru-RU')} soʻm`} />
                <Bar dataKey="gmvSoum" name="GMV" fill="#bcd2ff" />
                <Bar dataKey="commissionSoum" name="Komissiya" fill="#2447c4" />
              </BarChart>
            </ChartFrame>
          </Card>
        </div>
      )}

      {/* Huquq bo'lmasa bo'lim UMUMAN ko'rinmaydi: bosilganda 403
          beradigan havola panelni buzilgan ko'rsatadi */}
      {can('complaints.view') ? <ComplaintsSummary /> : null}
    </div>
  );
}

// -------------------------------------------------------------------- KPI

function Kpi({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string;
}) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {delta ? <p className="mt-1 text-xs text-brand-700">{delta}</p> : null}
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

/**
 * Grafik ramkasi.
 *
 * BO'SH HOLAT ALOHIDA: `ResponsiveContainer` ma'lumotsiz bo'sh oq
 * to'rtburchak chizadi va operator buni "yuklanmadi" deb o'ylaydi.
 */
function ChartFrame({ empty, children }: { empty: boolean; children: ReactElement }) {
  if (empty) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-400">
        Bu oraliqda maʼlumot yoʻq
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------- shikoyatlar

interface Complaint {
  id: string;
  category: string;
  subject: string | null;
  status: string;
  priority: number | null;
  createdAt: string;
}

function ComplaintsSummary() {
  const complaints = useQuery({
    queryKey: ['complaints', 'OPEN'],
    queryFn: () => api.get<Complaint[]>('/admin/complaints', { status: 'OPEN' }),
  });

  if (!complaints.data || complaints.data.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-base font-semibold text-slate-800">Ochiq shikoyatlar</h2>
      <Card>
        <ul className="divide-y divide-slate-100">
          {complaints.data.slice(0, 5).map((complaint) => (
            <li key={complaint.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {complaint.category}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                {complaint.subject ?? 'Mavzusiz'}
              </span>
              {complaint.priority !== null && complaint.priority <= 1 ? (
                <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                  Yuqori
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {complaints.data.length > 5 ? (
          <p className="mt-3 text-xs text-slate-500">
            Yana {complaints.data.length - 5} ta — “Shikoyatlar” bo‘limida.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

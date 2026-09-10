import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/features/auth/session';
import { writeToken } from '@/lib/token-store';

import { DashboardPage } from './dashboard-page';

/**
 * Boshqaruv paneli ekrani.
 *
 * `ResponsiveContainer` jsdom'da o'lchamni 0 deb biladi va grafikni
 * chizmaydi — bu normal. Shuning uchun testlar RAQAMLARNI va
 * xatti-harakatni tekshiradi, SVG ni emas: grafikning piksellari
 * Recharts'ning ishi, bizniki esa unga to'g'ri ma'lumot berish.
 */

const STATS = {
  users: { total: 120, drivers: 70, shippers: 50, newToday: 4 },
  orders: { total: 340, active: 12, completed: 300, today: 6 },
  revenue: {
    totalTiyin: '500000000',
    totalFormatted: '5 000 000 soʻm',
    todayTiyin: '1000000',
    todayFormatted: '10 000 soʻm',
    monthTiyin: '90000000',
    monthFormatted: '900 000 soʻm',
  },
  activeLoads: 8,
  pendingVerifications: 3,
};

function seriesFor(days: number) {
  return Array.from({ length: days }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    created: index,
    cancelled: 0,
    completed: index,
    gmvTiyin: '100000',
    commissionTiyin: '5000',
  }));
}

function stubApi(options: { permissions?: string[]; complaints?: unknown[] } = {}) {
  const calls: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: URL | string) => {
      const full = String(url);
      const path = full.replace('http://localhost:3000/v1', '');
      calls.push(path);

      let payload: unknown = {};
      if (path.startsWith('/admin/me')) {
        payload = {
          adminId: 'a-1',
          email: 'admin@karvon.uz',
          fullName: 'Bosh Admin',
          role: 'SUPER_ADMIN',
          permissions: options.permissions ?? ['*'],
        };
      } else if (path.startsWith('/admin/dashboard/series')) {
        const days = Number(new URL(full).searchParams.get('days') ?? 30);
        payload = seriesFor(days);
      } else if (path.startsWith('/admin/dashboard')) {
        payload = STATS;
      } else if (path.startsWith('/admin/complaints')) {
        payload = options.complaints ?? [];
      }

      const text = JSON.stringify(payload);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(text),
        json: () => Promise.resolve(JSON.parse(text)),
      });
    }),
  );

  return calls;
}

function renderDashboard() {
  writeToken('admin-token');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe('DashboardPage', () => {
  it('★ KPI RAQAMLARI KOʻRSATILADI', async () => {
    stubApi();
    renderDashboard();

    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(screen.getByText('70 haydovchi · 50 yuk beruvchi')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('bugun +4')).toBeInTheDocument();
  });

  it('★ DAROMAD SERVERNING FORMATLANGAN QIYMATIDAN OLINADI', async () => {
    stubApi();
    renderDashboard();

    // Server uni `BigInt` bilan hisoblagan — mijozda qayta hisoblash
    // yaxlitlash xatosi keltirib chiqarardi
    expect(await screen.findByText('900 000 soʻm')).toBeInTheDocument();
    expect(screen.getByText('bugun 10 000 soʻm')).toBeInTheDocument();
  });

  it('★ TEKSHIRISH NAVBATI OGOHLANTIRISHI ENG TEPADA', async () => {
    stubApi();
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('3 ta yozuv tekshirishni kutmoqda');
    // Havola navbatga olib boradi: ogohlantirish ish talab qiladi
    expect(screen.getByRole('link', { name: /tekshirishni kutmoqda/ })).toHaveAttribute(
      'href',
      '/verifications',
    );
  });

  it('navbat boʻsh boʻlsa ogohlantirish yoʻq', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: URL | string) => {
        const path = String(url).replace('http://localhost:3000/v1', '');
        const payload = path.startsWith('/admin/dashboard/series')
          ? []
          : path.startsWith('/admin/dashboard')
            ? { ...STATS, pendingVerifications: 0 }
            : path.startsWith('/admin/me')
              ? {
                  adminId: 'a',
                  email: 'a@b.uz',
                  fullName: 'A',
                  role: 'SUPER_ADMIN',
                  permissions: ['*'],
                }
              : [];
        const text = JSON.stringify(payload);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(text),
          json: () => Promise.resolve(JSON.parse(text)),
        });
      }),
    );
    renderDashboard();

    await screen.findByText('120');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('★ ORALIQ ALMASHTIRILGANDA YANGI SOʻROV KETADI', async () => {
    const calls = stubApi();
    renderDashboard();

    await screen.findByText('120');
    await waitFor(() => expect(calls.some((c) => c.includes('days=30'))).toBe(true));

    await userEvent.click(screen.getByRole('button', { name: '7 kun' }));

    await waitFor(() => expect(calls.some((c) => c.includes('days=7'))).toBe(true));
    expect(screen.getByRole('button', { name: '7 kun' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('★ ORALIQ YIGʻINDISI KPI KARTALARNI TAKRORLAMAYDI', async () => {
    stubApi();
    renderDashboard();

    // KPI "hozirgi holat", bu esa "tanlangan oraliqda" — 30 kunlik
    // qatorda 0+1+...+29 = 435 ta yaratilgan
    expect(await screen.findByText(/435 yaratildi/)).toBeInTheDocument();
    expect(screen.getByText(/yakunlanish 100%/)).toBeInTheDocument();
  });

  it('★ BOʻSH ORALIQ "MAʼLUMOT YOʻQ" DEB AYTILADI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: URL | string) => {
        const path = String(url).replace('http://localhost:3000/v1', '');
        const payload = path.startsWith('/admin/dashboard/series')
          ? []
          : path.startsWith('/admin/dashboard')
            ? STATS
            : path.startsWith('/admin/me')
              ? {
                  adminId: 'a',
                  email: 'a@b.uz',
                  fullName: 'A',
                  role: 'SUPER_ADMIN',
                  permissions: ['*'],
                }
              : [];
        const text = JSON.stringify(payload);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(text),
          json: () => Promise.resolve(JSON.parse(text)),
        });
      }),
    );
    renderDashboard();

    // Bo'sh grafik ramkasi operatorga "yuklanmadi" bo'lib ko'rinardi
    expect(await screen.findAllByText('Bu oraliqda maʼlumot yoʻq')).toHaveLength(2);
  });

  it('★ HUQUQSIZ ADMIN SHIKOYATLARNI SOʻRAMAYDI', async () => {
    const calls = stubApi({ permissions: ['dashboard.view'] });
    renderDashboard();

    await screen.findByText('120');
    await waitFor(() => expect(calls.some((c) => c.includes('days='))).toBe(true));

    // Bosilganda 403 beradigan bo'lim panelni buzilgan ko'rsatadi —
    // so'rov ham yuborilmaydi
    expect(calls.some((call) => call.startsWith('/admin/complaints'))).toBe(false);
  });

  it('shikoyatlar roʻyxati koʻrsatiladi', async () => {
    stubApi({
      complaints: [
        {
          id: 'c-1',
          category: 'PAYMENT',
          subject: 'Pul yechilmadi',
          status: 'OPEN',
          priority: 1,
          createdAt: '2026-09-01T10:00:00.000Z',
        },
      ],
    });
    renderDashboard();

    expect(await screen.findByText('Pul yechilmadi')).toBeInTheDocument();
    expect(screen.getByText('Yuqori')).toBeInTheDocument();
  });
});

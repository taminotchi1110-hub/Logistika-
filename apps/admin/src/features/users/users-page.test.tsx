import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/features/auth/session';
import { writeToken } from '@/lib/token-store';

import { UsersPage } from './users-page';

/**
 * Foydalanuvchilar ekrani.
 *
 * Eng xavfli amal shu yerda: bloklash odamni ilovadan bir zumda
 * uchirib tushiradi va reys o'rtasida ham sodir bo'lishi mumkin.
 */

const ALI = {
  id: 'u-1',
  phone: '+998901112233',
  firstName: 'Ali',
  lastName: 'Valiyev',
  role: 'DRIVER' as const,
  status: 'ACTIVE' as const,
  ratingAvg: '4.75',
  ratingCount: 12,
  completedOrders: 18,
  cancelledOrders: 2,
  createdAt: '2026-08-01T10:00:00.000Z',
  lastSeenAt: '2026-09-09T10:00:00.000Z',
};

const YANGI = {
  ...ALI,
  id: 'u-2',
  phone: '+998901112244',
  firstName: 'Yangi',
  lastName: 'Haydovchi',
  ratingAvg: '0',
  ratingCount: 0,
  completedOrders: 0,
  cancelledOrders: 1,
};

function stubApi(options: { permissions?: string[] } = {}) {
  const calls: { path: string; method: string; body: unknown }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: URL | string, init?: RequestInit) => {
      const full = String(url);
      const path = full.replace('http://localhost:3000/v1', '');
      calls.push({
        path,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });

      let payload: unknown = {};
      if (path.startsWith('/admin/me')) {
        payload = {
          adminId: 'a-1',
          email: 'admin@karvon.uz',
          fullName: 'Bosh Admin',
          role: 'SUPER_ADMIN',
          permissions: options.permissions ?? ['*'],
        };
      } else if (path.startsWith('/admin/users/u-1')) {
        payload = {
          user: ALI,
          wallet: { balanceTiyin: '250000', formatted: '2 500 soʻm' },
          ordersCount: 20,
          documents: [
            {
              id: 'd-1',
              type: 'PASSPORT',
              verificationStatus: 'VERIFIED',
              createdAt: '2026-08-02T10:00:00.000Z',
            },
          ],
        };
      } else if (path.startsWith('/admin/users')) {
        const search = new URL(full).searchParams.get('search');
        payload = search ? [ALI] : [ALI, YANGI];
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

function renderUsers() {
  writeToken('admin-token');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <UsersPage />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe('UsersPage', () => {
  it('★ ROʻYXAT KOʻRSATILADI', async () => {
    stubApi();
    renderUsers();

    expect(await screen.findByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('+998901112233')).toBeInTheDocument();
    expect(screen.getByText('4.8 (12)')).toBeInTheDocument();
  });

  it('★ BAHOSIZ HAYDOVCHI "0.0" BILAN YOMON KOʻRSATILMAYDI', async () => {
    stubApi();
    renderUsers();

    await screen.findByText('Yangi Haydovchi');
    // Bitta "—" bahosiz foydalanuvchiniki
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.0 (0)')).toBeNull();
  });

  it('★ QIDIRUV KECHIKTIRILADI — HAR HARFDA SOʻROV KETMAYDI', async () => {
    const calls = stubApi();
    renderUsers();

    await screen.findByText('Ali Valiyev');
    const before = calls.filter((call) => call.path.startsWith('/admin/users?')).length;

    await userEvent.type(screen.getByLabelText('Qidirish'), '99890');

    // Besh harf — besh so'rov emas. Ular serverga behuda yuklama va
    // javoblar tartibsiz kelib, oxirgisi eng eski natijani
    // ko'rsatishi mumkin
    await waitFor(() => {
      const after = calls.filter((call) => call.path.startsWith('/admin/users?')).length;
      expect(after - before).toBeLessThanOrEqual(2);
    });
  });

  it('★ FILTR MANZILGA TUSHADI', async () => {
    const calls = stubApi();
    renderUsers();

    await screen.findByText('Ali Valiyev');
    await userEvent.selectOptions(screen.getByLabelText('Holat'), 'BANNED');

    await waitFor(() =>
      expect(calls.some((call) => call.path.includes('status=BANNED'))).toBe(true),
    );
  });

  it('★ QATOR BOSILGANDA TAFSILOT OCHILADI', async () => {
    stubApi();
    renderUsers();

    await userEvent.click(await screen.findByText('Ali Valiyev'));

    expect(await screen.findByText('2 500 soʻm')).toBeInTheDocument();
    expect(screen.getByText('PASSPORT')).toBeInTheDocument();
  });

  it('★ SABABSIZ BLOKLAB BOʻLMAYDI', async () => {
    const calls = stubApi();
    renderUsers();

    await userEvent.click(await screen.findByText('Ali Valiyev'));
    await userEvent.click(await screen.findByRole('button', { name: 'Bloklash' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sabab majburiy');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('★ BLOKLASH SABAB BILAN YUBORILADI', async () => {
    const calls = stubApi();
    renderUsers();

    await userEvent.click(await screen.findByText('Ali Valiyev'));
    await userEvent.click(await screen.findByRole('button', { name: 'Bloklash' }));
    await userEvent.type(screen.getByLabelText('Sabab'), 'Firibgarlik shubhasi');
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST');
      expect(post?.path).toBe('/admin/users/u-1/status');
      expect(post?.body).toEqual({ status: 'BANNED', reason: 'Firibgarlik shubhasi' });
    });
  });

  it('★ OQIBAT OGOHLANTIRISHDA AYTILADI', async () => {
    stubApi();
    renderUsers();

    await userEvent.click(await screen.findByText('Ali Valiyev'));
    await userEvent.click(await screen.findByRole('button', { name: 'Bloklash' }));

    // Operator "sessiyalar bekor bo'ladi" degan oqibatni bilishi kerak
    expect(screen.getByText(/reys o‘rtasida ham/)).toBeInTheDocument();
    // Kimni bloklayotgani ham koʻrinib turadi — notoʻgʻri qatorni
    // bosish eng oson xato. Ism jadvalda ham bor, shuning uchun aynan
    // tasdiqlash qatori qidiriladi
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' && element.textContent === 'Ali Valiyev — Bloklangan',
      ),
    ).toBeInTheDocument();
  });

  it('★ HUQUQSIZ ADMINDA BLOKLASH TUGMASI YOʻQ', async () => {
    stubApi({ permissions: ['users.view'] });
    renderUsers();

    await userEvent.click(await screen.findByText('Ali Valiyev'));
    await screen.findByText('2 500 soʻm');

    // Bosilganda 403 beradigan tugma panelni buzilgan koʻrsatadi
    expect(screen.queryByRole('button', { name: 'Bloklash' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vaqtincha toʻxtatish' })).toBeNull();
  });
});

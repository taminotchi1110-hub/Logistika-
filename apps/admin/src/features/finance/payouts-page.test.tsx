import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/features/auth/session';
import { writeToken } from '@/lib/token-store';

import { LedgerPage } from './ledger-page';
import { PayoutsPage } from './payouts-page';

/**
 * Moliya ekranlari.
 *
 * "Bajarildi" bosilgandan keyin pul haydovchining hamyonidan chiqib
 * ketgan hisoblanadi. Bu yerdagi xato — qo'lda tuzatishni talab
 * qiladigan pul xatosi.
 */

const PAYOUT = {
  id: 'p-1',
  amountTiyin: '15000000',
  cardMask: '8600 **** **** 1234',
  status: 'PENDING',
  requestedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  driverId: 'u-1',
  firstName: 'Ali',
  lastName: 'Valiyev',
  phone: '+998901112233',
};

function stubApi(options: { permissions?: string[]; integrityOk?: boolean } = {}) {
  const calls: { path: string; method: string; body: unknown }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: URL | string, init?: RequestInit) => {
      const path = String(url).replace('http://localhost:3000/v1', '');
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
      } else if (path.startsWith('/admin/payouts') && (init?.method ?? 'GET') === 'GET') {
        payload = [PAYOUT];
      } else if (path.startsWith('/admin/ledger/integrity')) {
        payload =
          options.integrityOk === false
            ? {
                ok: false,
                mismatches: [{ accountId: 'acc-1', stored: '500000', computed: '450000' }],
              }
            : { ok: true, mismatches: [] };
      } else {
        payload = { ok: true };
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

function renderWith(ui: ReactElement) {
  writeToken('admin-token');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SessionProvider>,
  );
}

describe('PayoutsPage', () => {
  it('★ SOʻROV VA JAMI KOʻRSATILADI', async () => {
    stubApi();
    renderWith(<PayoutsPage />);

    expect(await screen.findByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('8600 **** **** 1234')).toBeInTheDocument();
    // Summa katta va aniq: operator uni bankka koʻchiradi
    expect(screen.getAllByText('150 000 soʻm').length).toBeGreaterThan(0);
    expect(screen.getByText(/jami 150 000 soʻm/)).toBeInTheDocument();
  });

  it('★ TRANZAKSIYA RAQAMISIZ BAJARIB BOʻLMAYDI', async () => {
    const calls = stubApi();
    renderWith(<PayoutsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Bajarildi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    // Server uni ixtiyoriy qiladi va boʻsh boʻlsa "MANUAL" yozib
    // qoʻyadi. Interfeys esa uni ATAYLAB majburiy qiladi
    expect(await screen.findByRole('alert')).toHaveTextContent('tranzaksiya raqamini kiriting');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('★ RAQAM BILAN BAJARILADI', async () => {
    const calls = stubApi();
    renderWith(<PayoutsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Bajarildi' }));
    await userEvent.type(screen.getByLabelText('Bank tranzaksiya raqami'), 'BANK-2026-0001');
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST');
      expect(post?.path).toBe('/admin/payouts/p-1/complete');
      expect(post?.body).toEqual({ providerTxnId: 'BANK-2026-0001' });
    });
  });

  it('★ SABABSIZ RAD ETIB BOʻLMAYDI', async () => {
    const calls = stubApi();
    renderWith(<PayoutsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Rad etish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    // Pul hamyonga qaytadi va haydovchi nega rad etilganini bilishi
    // kerak, aks holda qayta soʻrov yuboradi
    expect(await screen.findByRole('alert')).toHaveTextContent('sababini koʻrsating');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('★ LEDGER BUZILGAN BOʻLSA PUL YUBORISHDAN OLDIN OGOHLANTIRILADI', async () => {
    stubApi({ integrityOk: false });
    renderWith(<PayoutsPage />);

    // Balans yozuvlarga mos kelmasa, hamyondagi raqam yolgʻon boʻlishi
    // mumkin — bu mavjud boʻlmagan pulni yuborish xavfi
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ledger buzilgan');
    expect(alert).toHaveTextContent('1 ta hisobda');
  });

  it('★ HUQUQSIZ ADMIN AMAL TUGMALARINI KOʻRMAYDI', async () => {
    stubApi({ permissions: ['payments.view'] });
    renderWith(<PayoutsPage />);

    await screen.findByText('Ali Valiyev');

    expect(screen.queryByRole('button', { name: 'Bajarildi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rad etish' })).toBeNull();
  });

  it('boʻsh navbat ochiq aytiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: URL | string) => {
        const path = String(url).replace('http://localhost:3000/v1', '');
        const payload = path.startsWith('/admin/payouts')
          ? []
          : path.startsWith('/admin/ledger')
            ? { ok: true, mismatches: [] }
            : {
                adminId: 'a',
                email: 'a@b.uz',
                fullName: 'A',
                role: 'SUPER_ADMIN',
                permissions: ['*'],
              };
        const text = JSON.stringify(payload);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(text),
          json: () => Promise.resolve(JSON.parse(text)),
        });
      }),
    );
    renderWith(<PayoutsPage />);

    expect(await screen.findByText('Kutilayotgan soʻrov yoʻq.')).toBeInTheDocument();
  });
});

describe('LedgerPage', () => {
  it('★ BUTUN LEDGER BIR QARASHDA KOʻRINADI', async () => {
    stubApi();
    renderWith(<LedgerPage />);

    expect(await screen.findByText('Ledger butun')).toBeInTheDocument();
  });

  it('★ NOMUVOFIQLIKDA FARQ KOʻRSATILADI', async () => {
    stubApi({ integrityOk: false });
    renderWith(<LedgerPage />);

    expect(await screen.findByText('acc-1')).toBeInTheDocument();
    expect(screen.getByText('5 000 soʻm')).toBeInTheDocument();
    expect(screen.getByText('4 500 soʻm')).toBeInTheDocument();
    // Farq — eng muhim ustun: qancha pul "yoʻqolgan"
    expect(screen.getByText('500 soʻm')).toBeInTheDocument();
  });
});

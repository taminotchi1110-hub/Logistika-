import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/features/auth/session';
import { writeToken } from '@/lib/token-store';

import { ComplaintsPage, resolutionRequired, waitedFor } from './complaints-page';

/**
 * Shikoyatlar ekrani.
 *
 * Yakuniy qaror odamning pulini yoki ishini hal qiladi — izohsiz
 * "rad etildi" shikoyatning ikkinchi to'lqinini keltirib chiqaradi.
 */

describe('resolutionRequired', () => {
  it('★ YAKUNIY QARORDA IZOH MAJBURIY', () => {
    expect(resolutionRequired('RESOLVED')).toBe(true);
    expect(resolutionRequired('REJECTED')).toBe(true);
    expect(resolutionRequired('ESCALATED')).toBe(true);
  });

  it('“koʻrib chiqishga olish”da izoh shart emas', () => {
    // Bu shunchaki "men shugʻullanyapman" degan belgi
    expect(resolutionRequired('IN_REVIEW')).toBe(false);
  });
});

describe('waitedFor', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  it('kutish vaqti oʻqiladigan shaklda', () => {
    expect(waitedFor('2026-09-10T11:40:00.000Z', now)).toBe('hozir');
    expect(waitedFor('2026-09-10T09:00:00.000Z', now)).toBe('3 soat');
    expect(waitedFor('2026-09-08T12:00:00.000Z', now)).toBe('2 kun');
  });

  it('buzuq sana yiqitmaydi', () => {
    expect(waitedFor('nonsense', now)).toBe('hozir');
  });
});

const COMPLAINT = {
  id: 'c-1',
  category: 'PAYMENT',
  subject: 'Pul yechilmadi',
  description: 'Uch kundan beri kutyapman',
  status: 'OPEN',
  priority: 1,
  orderId: 'abcdef12-3456-7890-abcd-ef1234567890',
  createdAt: '2026-09-08T10:00:00.000Z',
  reporterFirstName: 'Ali',
  reporterLastName: 'Valiyev',
  reporterPhone: '+998901112233',
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

      const payload = path.startsWith('/admin/me')
        ? {
            adminId: 'a-1',
            email: 'admin@karvon.uz',
            fullName: 'Bosh Admin',
            role: 'SUPER_ADMIN',
            permissions: options.permissions ?? ['*'],
          }
        : path.startsWith('/admin/complaints') && (init?.method ?? 'GET') === 'GET'
          ? [COMPLAINT]
          : { ok: true };

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

function renderComplaints() {
  writeToken('admin-token');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <ComplaintsPage />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe('ComplaintsPage', () => {
  it('★ SHIKOYAT VA UNING KONTEKSTI KOʻRSATILADI', async () => {
    stubApi();
    renderComplaints();

    expect(await screen.findByText('Pul yechilmadi')).toBeInTheDocument();
    expect(screen.getByText('Uch kundan beri kutyapman')).toBeInTheDocument();
    expect(screen.getByText(/Ali Valiyev/)).toBeInTheDocument();
    expect(screen.getByText('Yuqori prioritet')).toBeInTheDocument();
  });

  it('★ OCHIQ SHIKOYATLAR BIRINCHI FILTR', async () => {
    const calls = stubApi();
    renderComplaints();

    await screen.findByText('Pul yechilmadi');
    // Operator ekranga kirib, ish talab qiladigan narsani koʻrishi kerak
    expect(calls.some((call) => call.path.includes('status=OPEN'))).toBe(true);
  });

  it('★ IZOHSIZ RAD ETIB BOʻLMAYDI', async () => {
    const calls = stubApi();
    renderComplaints();

    await userEvent.click(await screen.findByRole('button', { name: 'Rad etish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('izohini yozing');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('★ QAROR IZOH BILAN YUBORILADI', async () => {
    const calls = stubApi();
    renderComplaints();

    await userEvent.click(await screen.findByRole('button', { name: 'Hal qilindi' }));
    await userEvent.type(screen.getByLabelText('Qaror izohi'), 'Pul qaytarildi');
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST');
      expect(post?.path).toBe('/admin/complaints/c-1/resolve');
      expect(post?.body).toEqual({ status: 'RESOLVED', resolution: 'Pul qaytarildi' });
    });
  });

  it('★ "KOʻRIB CHIQISHGA OLISH" IZOHSIZ OʻTADI', async () => {
    const calls = stubApi();
    renderComplaints();

    await userEvent.click(await screen.findByRole('button', { name: 'Koʻrib chiqishga olish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST');
      expect(post?.body).toEqual({ status: 'IN_REVIEW' });
    });
  });

  it('★ HUQUQSIZ ADMIN QAROR QABUL QILA OLMAYDI', async () => {
    stubApi({ permissions: ['complaints.view'] });
    renderComplaints();

    await screen.findByText('Pul yechilmadi');
    expect(screen.queryByRole('button', { name: 'Hal qilindi' })).toBeNull();
  });
});

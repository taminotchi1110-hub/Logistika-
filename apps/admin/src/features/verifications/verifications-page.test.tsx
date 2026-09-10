import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { writeToken } from '@/lib/token-store';

import { VerificationsPage, waitingFor } from './verifications-page';

/**
 * Verifikatsiya navbati ekrani.
 *
 * Bu yerdagi xatolar QIMMAT: noto'g'ri tasdiqlangan hujjatni orqaga
 * qaytarib bo'lmaydi va u haydovchini yo'lga chiqaradi.
 */

const PERSON = { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901112233' };

function queueBody() {
  return {
    documents: [
      {
        ...PERSON,
        id: 'd-1',
        type: 'PASSPORT',
        ownerType: 'USER',
        ownerId: 'u-1',
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    drivers: [
      {
        ...PERSON,
        firstName: 'Bek',
        userId: 'u-2',
        licenseCategories: ['B', 'C'],
        experienceYears: 5,
        createdAt: '2026-09-01T11:00:00.000Z',
      },
    ],
    vehicles: [],
    total: 2,
  };
}

/** Chaqirilgan so'rovlarni yozib boradigan `fetch`. */
function stubApi(options: { onReview?: (path: string, body: unknown) => void } = {}) {
  const calls: { path: string; method: string; body: unknown }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: URL | string, init?: RequestInit) => {
      const path = String(url).replace('http://localhost:3000/v1', '');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ path, method, body });

      let payload: unknown = {};
      if (path === '/admin/verifications') payload = queueBody();
      else if (path.endsWith('/url'))
        payload = {
          id: 'd-1',
          type: 'PASSPORT',
          fileName: 'passport.jpg',
          mimeType: 'image/jpeg',
          pageSide: 'FRONT',
          url: 'https://storage.example/doc.jpg?X-Amz-Signature=abc',
        };
      else if (path.endsWith('/review')) {
        options.onReview?.(path, body);
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

function renderPage() {
  writeToken('admin-token');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <VerificationsPage />
    </QueryClientProvider>,
  );
}

describe('VerificationsPage', () => {
  it('★ UCH TUR BITTA NAVBATDA, ESKISI BIRINCHI', async () => {
    stubApi();
    renderPage();

    const list = await screen.findByRole('navigation', { name: 'Navbat' });
    const buttons = within(list).getAllByRole('button');

    expect(buttons).toHaveLength(2);
    // Hujjat 10:00 da, haydovchi 11:00 da — FIFO
    expect(buttons[0]).toHaveTextContent('Pasport');
    expect(buttons[1]).toHaveTextContent('Bek');
  });

  it('★ BIRINCHI ELEMENT OʻZI TANLANADI', async () => {
    stubApi();
    renderPage();

    // Operator ekranga kirib, darhol ishlay boshlashi kerak
    expect(await screen.findByRole('heading', { name: 'Pasport' })).toBeInTheDocument();
  });

  it('★ HUJJAT HAVOLASI FAQAT TANLANGANDA SOʻRALADI', async () => {
    const calls = stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await waitFor(() => expect(screen.getByAltText('passport.jpg')).toBeInTheDocument());

    // Har bir `/url` chaqiruvi AUDITGA yoziladi. Oldindan yuklash
    // (prefetch) ochilmagan hujjatlar uchun soxta "koʻrildi" yozuvlari
    // yaratardi
    const urlCalls = calls.filter((call) => call.path.endsWith('/url'));
    expect(urlCalls).toHaveLength(1);
    expect(urlCalls[0]?.path).toBe('/admin/documents/d-1/url');
  });

  it('★ TASDIQLASH TOʻGʻRI ENDPOINTGA KETADI VA KEYINGISI OCHILADI', async () => {
    const calls = stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    const review = calls.find((call) => call.path.endsWith('/review'));
    expect(review?.path).toBe('/admin/documents/d-1/review');
    expect(review?.body).toEqual({ approve: true });

    // Hal qilingan element yo'qoladi va keyingisi o'zi tanlanadi
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Bek Valiyev' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'Pasport' })).toBeNull();
  });

  it('★ SABABSIZ RAD ETIB BOʻLMAYDI', async () => {
    const calls = stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await userEvent.click(screen.getByRole('button', { name: 'Rad etish' }));

    // Formadagi tasdiqlash tugmasi — sababsiz
    const confirm = screen
      .getAllByRole('button', { name: 'Rad etish' })
      .find((button) => button.className.includes('bg-danger'));
    await userEvent.click(confirm!);

    // Sababsiz rad etish foydalanuvchiga nima qilishini aytmaydi: u
    // qayta yuklaydi, yana rad etiladi va navbat aylanib qoladi
    expect(await screen.findByRole('alert')).toHaveTextContent('sababini koʻrsating');
    expect(calls.some((call) => call.path.endsWith('/review'))).toBe(false);
  });

  it('★ TAYYOR SABAB BITTA BOSISHDA QOʻYILADI', async () => {
    const calls = stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await userEvent.click(screen.getByRole('button', { name: 'Rad etish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rasm xira, matn o‘qilmaydi' }));

    const confirm = screen
      .getAllByRole('button', { name: 'Rad etish' })
      .find((button) => button.className.includes('bg-danger'));
    await userEvent.click(confirm!);

    await waitFor(() => {
      const review = calls.find((call) => call.path.endsWith('/review'));
      expect(review?.body).toEqual({ approve: false, reason: 'Rasm xira, matn o‘qilmaydi' });
    });
  });

  it('★ "A" TUGMASI TASDIQLAYDI', async () => {
    const calls = stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await userEvent.keyboard('a');

    await waitFor(() => {
      const review = calls.find((call) => call.path.endsWith('/review'));
      expect(review?.body).toEqual({ approve: true });
    });
  });

  it('★ SABAB YOZILAYOTGANDA "A" TASDIQLAMAYDI', async () => {
    const calls = stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await userEvent.click(screen.getByRole('button', { name: 'Rad etish' }));

    const input = screen.getByLabelText('Rad etish sababi');
    await userEvent.click(input);
    await userEvent.type(input, 'Rasm xira');

    // Agar yorliq matn maydonida ham ishlasa, hujjat XATO TASDIQLANADI
    // va buni orqaga qaytarib bo'lmaydi
    expect(calls.some((call) => call.path.endsWith('/review'))).toBe(false);
    expect(input).toHaveValue('Rasm xira');
  });

  it('★ "R" RAD ETISH FORMASINI OCHADI VA FOKUS BERADI', async () => {
    stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await userEvent.keyboard('r');

    const input = await screen.findByLabelText('Rad etish sababi');
    // Fokus berilmasa, operator sichqoncha bilan maydonni bosishi kerak
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('★ PASTGA STRELKA KEYINGISIGA OʻTADI', async () => {
    stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await userEvent.keyboard('{ArrowDown}');

    expect(await screen.findByRole('heading', { name: 'Bek Valiyev' })).toBeInTheDocument();
  });

  it('★ HAYDOVCHIDA "RASM QANI?" SAVOLI TUGʻILMAYDI', async () => {
    stubApi();
    renderPage();

    await screen.findByRole('heading', { name: 'Pasport' });
    await userEvent.keyboard('{ArrowDown}');

    expect(await screen.findByText(/ko‘riladigan fayl yo‘q/)).toBeInTheDocument();
  });

  it('boʻsh navbat ochiq aytiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const text = JSON.stringify({ documents: [], drivers: [], vehicles: [], total: 0 });
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(text),
          json: () => Promise.resolve(JSON.parse(text)),
        });
      }),
    );
    renderPage();

    expect(await screen.findByText(/Navbat bo‘sh/)).toBeInTheDocument();
  });
});

describe('waitingFor', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');

  it('★ KUTISH VAQTI KOʻRINADI — SLA BUZILISHI SEZILADI', () => {
    expect(waitingFor('2026-09-09T11:59:30.000Z', now)).toBe('hozir');
    expect(waitingFor('2026-09-09T11:30:00.000Z', now)).toBe('30 daqiqa kutmoqda');
    expect(waitingFor('2026-09-09T09:00:00.000Z', now)).toBe('3 soat kutmoqda');
    expect(waitingFor('2026-09-07T12:00:00.000Z', now)).toBe('2 kun kutmoqda');
  });
});

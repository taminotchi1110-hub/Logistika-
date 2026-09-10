import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/features/auth/session';
import { writeToken } from '@/lib/token-store';

import { formatValue, parseValue, SettingsPage } from './settings-page';

/**
 * Sozlamalar.
 *
 * BU EKRAN PLATFORMANI KODNI QAYTA YIGʻMASDAN OʻZGARTIRADI. Komissiya
 * foizi, matching ogʻirliklari, jarima — bittasidagi xato butun
 * platformaga darhol taʼsir qiladi.
 */

describe('parseValue', () => {
  it('★ SON SON BOʻLIB QOLADI', () => {
    // `0.05` oʻrniga `"0.05"` saqlansa, uni oʻqiydigan kod NaN oladi
    // va komissiya jimgina hisoblanmay qoʻyadi
    expect(parseValue('0.05')).toEqual({ ok: true, value: 0.05 });
    expect(parseValue('12')).toEqual({ ok: true, value: 12 });
  });

  it('obyekt va massiv qabul qilinadi', () => {
    // `matching.weights` — obyekt, `radius.steps_km` — massiv
    expect(parseValue('{"distance": 0.4}')).toEqual({ ok: true, value: { distance: 0.4 } });
    expect(parseValue('[10, 50, 200]')).toEqual({ ok: true, value: [10, 50, 200] });
  });

  it('★ NOTOʻGʻRI JSON SAQLANMAYDI', () => {
    const result = parseValue('0,05');
    expect(result.ok).toBe(false);
    // Xato matnida MISOL boʻlishi kerak: operator JSON yozishni
    // bilmasligi mumkin
    if (!result.ok) expect(result.error).toContain('0.05');
  });

  it('★ BOʻSH QIYMAT RAD ETILADI', () => {
    // Boʻsh satr `JSON.parse` da xato beradi, lekin sabab tushunarsiz
    // boʻlardi ("Unexpected end of JSON input")
    expect(parseValue('   ').ok).toBe(false);
  });
});

describe('formatValue', () => {
  it('obyekt oʻqiladigan koʻrinishda', () => {
    expect(formatValue({ a: 1 })).toContain('\n');
  });

  it('★ SON BIR QATORDA QOLADI', () => {
    // Bitta son uchun koʻp qatorli formatlash maydonni behuda
    // kattalashtirardi
    expect(formatValue(0.05)).toBe('0.05');
    expect(formatValue('matn')).toBe('"matn"');
  });
});

const SETTINGS = [
  {
    key: 'commission.default_rate',
    value: 0.05,
    description: 'Standart komissiya foizi',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
];

function stubApi(options: { permissions?: string[] } = {}) {
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

      const payload = path.startsWith('/admin/me')
        ? {
            adminId: 'a-1',
            email: 'admin@karvon.uz',
            fullName: 'Bosh Admin',
            role: 'SUPER_ADMIN',
            permissions: options.permissions ?? ['*'],
          }
        : path.startsWith('/admin/settings') && (init?.method ?? 'GET') === 'GET'
          ? SETTINGS
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

function renderSettings() {
  writeToken('admin-token');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <SettingsPage />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe('SettingsPage', () => {
  it('★ SOZLAMA VA IZOHI KOʻRSATILADI', async () => {
    stubApi();
    renderSettings();

    expect(await screen.findByText('commission.default_rate')).toBeInTheDocument();
    expect(screen.getByText('Standart komissiya foizi')).toBeInTheDocument();
    expect(screen.getByText('0.05')).toBeInTheDocument();
  });

  it('★ OʻZGARISH DARHOL KUCHGA KIRISHI AYTILADI', async () => {
    stubApi();
    renderSettings();

    await screen.findByText('commission.default_rate');
    // Operator bu maydon "keyinroq qoʻllanadi" deb oʻylamasligi kerak
    expect(screen.getByText(/darhol/)).toBeInTheDocument();
  });

  it('★ SON SON BOʻLIB YUBORILADI', async () => {
    const calls = stubApi();
    renderSettings();

    await userEvent.click(await screen.findByRole('button', { name: 'Oʻzgartirish' }));

    const input = screen.getByLabelText('commission.default_rate qiymati');
    await userEvent.clear(input);
    await userEvent.type(input, '0.12');
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => {
      const put = calls.find((call) => call.method === 'PUT');
      expect(put?.path).toBe('/admin/settings/commission.default_rate');
      // Satr emas, SON: `"0.12"` saqlansa komissiya hisoblanmay qoʻyadi
      expect(put?.body).toEqual({ value: 0.12 });
    });
  });

  it('★ NOTOʻGʻRI JSON YUBORILMAYDI', async () => {
    const calls = stubApi();
    renderSettings();

    await userEvent.click(await screen.findByRole('button', { name: 'Oʻzgartirish' }));

    const input = screen.getByLabelText('commission.default_rate qiymati');
    await userEvent.clear(input);
    await userEvent.type(input, '0,12');
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    // Server `value` ni ixtiyoriy turda qabul qiladi (`@Allow()`) —
    // notoʻgʻri shakl jimgina saqlanib qolardi
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON boʻlishi kerak');
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('★ HUQUQSIZ ADMIN OʻZGARTIRA OLMAYDI', async () => {
    stubApi({ permissions: ['settings.view'] });
    renderSettings();

    await screen.findByText('commission.default_rate');
    expect(screen.queryByRole('button', { name: 'Oʻzgartirish' })).toBeNull();
  });
});

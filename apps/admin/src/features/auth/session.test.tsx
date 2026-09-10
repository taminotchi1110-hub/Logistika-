import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { readToken, writeToken } from '@/lib/token-store';

import { SessionProvider, useSession } from './session';

/**
 * Sessiya boshqaruvi.
 *
 * ENG NOZIK QISM: sessiya noto'g'ri ishlasa, admin panel yoki ochiq
 * qoladi (xavfsizlik), yoki ish o'rtasida chiqarib tashlaydi
 * (operator ishini yo'qotadi).
 */

const ADMIN = {
  adminId: 'a-1',
  email: 'admin@karvon.uz',
  fullName: 'Bosh Admin',
  role: 'SUPER_ADMIN',
  permissions: ['*'],
};

const MODERATOR = { ...ADMIN, role: 'MODERATOR', permissions: ['docs.verify'] };

/** Sessiya holatini ko'rsatadigan oddiy probe. */
function Probe() {
  const { status, admin, logoutReason, login, logout, can } = useSession();

  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="admin">{admin?.email ?? '-'}</p>
      <p data-testid="reason">{logoutReason ?? '-'}</p>
      <p data-testid="can-payout">{String(can('payouts.process'))}</p>
      <button
        onClick={() => {
          void login({ email: 'admin@karvon.uz', password: 'x', totp: '123456' });
        }}
      >
        kirish
      </button>
      <button onClick={() => logout('manual')}>chiqish</button>
    </div>
  );
}

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: URL | string, init?: RequestInit) => {
      const result = handler(String(url), init) as { status?: number; body?: unknown };
      const status = result.status ?? 200;
      const text = result.body === undefined ? '' : JSON.stringify(result.body);
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(text),
        json: () => Promise.resolve(JSON.parse(text || '{}')),
      });
    }),
  );
}

describe('SessionProvider', () => {
  it('tokensiz darhol anonim boʻladi', () => {
    stubFetch(() => ({ body: {} }));
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    // `loading` holatida qolib qolsa, kirish formasi hech qachon
    // ko'rinmaydi
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
  });

  it('★ TOKEN BOR — HOLAT SERVERDAN TEKSHIRILADI', async () => {
    // Tokenni o'qib, ichidagi huquqlarga ishonish mumkin emas: admin
    // bloklangan yoki roli o'zgargan bo'lishi mumkin, token esa hali
    // amal qiladi
    writeToken('mavjud-token');
    stubFetch((url) => (url.endsWith('/admin/me') ? { body: MODERATOR } : { status: 404 }));

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    // Server MODERATOR dedi — tokenda nima yozilganidan qat'i nazar
    expect(screen.getByTestId('can-payout')).toHaveTextContent('false');
  });

  it('★ SERVER TOKENNI RAD ETSA — KIRISH EKRANIGA', async () => {
    writeToken('eskirgan');
    stubFetch(() => ({
      status: 401,
      body: { error: { code: 'AUTH_UNAUTHORIZED', message: 'Token eskirgan' } },
    }));

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(readToken()).toBeNull();
    // Sabab ko'rsatiladi: sababsiz "qaytadan kiring" nosozlikka o'xshaydi
    expect(screen.getByTestId('reason')).toHaveTextContent('expired');
  });

  it('★ KIRISHDA TOKEN SAQLANADI VA HUQUQLAR OʻRNATILADI', async () => {
    stubFetch((url) =>
      url.endsWith('/admin/auth/login')
        ? { body: { accessToken: 'yangi-token', admin: ADMIN } }
        : { status: 404 },
    );

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await userEvent.click(screen.getByText('kirish'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(readToken()).toBe('yangi-token');
    expect(screen.getByTestId('can-payout')).toHaveTextContent('true');
  });

  it('★ CHIQISHDA TOKEN OʻCHIRILADI', async () => {
    stubFetch((url) =>
      url.endsWith('/admin/auth/login')
        ? { body: { accessToken: 'yangi-token', admin: ADMIN } }
        : { status: 404 },
    );

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await userEvent.click(screen.getByText('kirish'));
    await waitFor(() => expect(readToken()).toBe('yangi-token'));

    await userEvent.click(screen.getByText('chiqish'));

    // Token QOLSA, brauzerni yopmagan odam orqaga qaytib sessiyaga
    // kirib olardi
    expect(readToken()).toBeNull();
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
  });

  it('★ 30 DAQIQA HARAKATSIZLIKDA AVTOMATIK CHIQARADI', async () => {
    writeToken('token');
    stubFetch(() => ({ body: ADMIN }));

    // SOXTA SOAT RENDER'DAN OLDIN YOQILADI. Aks holda `setInterval`
    // haqiqiy taymer bilan yaratiladi va `advanceTimersByTime` unga
    // ta'sir qilmaydi — test hech narsani tekshirmagan holda o'tardi.
    // `shouldAdvanceTime` — `waitFor` va promise'lar ishlashi uchun:
    // usiz soxta soat butunlay to'xtaydi va kutish cheksiz bo'ladi.
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await act(async () => {
      vi.advanceTimersByTime(31 * 60 * 1000);
    });

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('reason')).toHaveTextContent('idle');
    expect(readToken()).toBeNull();
  });

  it('★ HARAKAT TAYMERNI QAYTA BOSHLAYDI', async () => {
    writeToken('token');
    stubFetch(() => ({ body: ADMIN }));

    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    // 25 daqiqa — hali chegara emas
    await act(async () => {
      vi.advanceTimersByTime(25 * 60 * 1000);
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');

    // Operator tugma bosdi: hisob noldan boshlanadi
    await act(async () => {
      window.dispatchEvent(new Event('keydown'));
    });

    // Yana 25 daqiqa: jami 50 daqiqa, lekin oxirgi harakatdan 25 daqiqa
    await act(async () => {
      vi.advanceTimersByTime(25 * 60 * 1000);
    });

    // Ish o'rtasida chiqarib tashlash operatorning ishini yo'qotadi
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });
});

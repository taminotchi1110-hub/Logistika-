import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { readToken } from '@/lib/token-store';

import { LoginPage } from './login-page';
import { SessionProvider } from './session';

/**
 * Kirish ekrani.
 *
 * Panelga yagona eshik. Bu yerdagi xato — hech kim ishlay olmaydi
 * yoki, yomoni, kirmasligi kerak odam kiradi.
 */
function stubLogin(result: { status?: number; body?: unknown }) {
  const fetchMock = vi.fn().mockImplementation(() => {
    const status = result.status ?? 200;
    const text = result.body === undefined ? '' : JSON.stringify(result.body);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(text),
      json: () => Promise.resolve(JSON.parse(text || '{}')),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderLogin() {
  return render(
    <SessionProvider>
      <LoginPage />
    </SessionProvider>,
  );
}

async function fillAndSubmit(totp = '123456') {
  await userEvent.type(screen.getByLabelText('Email'), 'admin@karvon.uz');
  await userEvent.type(screen.getByLabelText('Parol'), 'Karvon!Admin2026');
  await userEvent.type(screen.getByLabelText('Autentifikator kodi'), totp);
  await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));
}

describe('LoginPage', () => {
  it('★ UCHTA MAYDON BOR — TOTP MAJBURIY', () => {
    stubLogin({ body: {} });
    renderLogin();

    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Parol')).toBeRequired();
    // Ikki faktorni "keyinroq" qilib qoldirish mumkin emas: admin
    // paneli parol o'g'irlanishiga qarshi shu bilan himoyalanadi
    expect(screen.getByLabelText('Autentifikator kodi')).toBeRequired();
  });

  it('★ TOʻGʻRI MAʼLUMOTDA TOKEN SAQLANADI', async () => {
    const fetchMock = stubLogin({
      body: {
        accessToken: 'admin-token',
        admin: {
          adminId: 'a-1',
          email: 'admin@karvon.uz',
          fullName: 'Bosh Admin',
          role: 'SUPER_ADMIN',
          permissions: ['*'],
        },
      },
    });

    renderLogin();
    await fillAndSubmit();

    await waitFor(() => expect(readToken()).toBe('admin-token'));

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'admin@karvon.uz',
      password: 'Karvon!Admin2026',
      totp: '123456',
    });
  });

  it('★ SERVER MATNI OʻZGARTIRILMAYDI', async () => {
    // Server ataylab UMUMIY matn qaytaradi va email mavjudligini
    // oshkor qilmaydi. Uni "aniqlashtirish" adminlarni email bo'yicha
    // topish imkonini berardi
    stubLogin({
      status: 401,
      body: { error: { code: 'AUTH_UNAUTHORIZED', message: 'Email yoki parol notoʻgʻri' } },
    });

    renderLogin();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Email yoki parol notoʻgʻri');
    expect(readToken()).toBeNull();
  });

  it('★ NOTOʻGʻRI PAROL "SESSIYA TUGADI" DEB KOʻRSATILMAYDI', async () => {
    // Kirish so'rovi `anonymous` bo'lmasa, 401 javobi umumiy "token
    // eskirdi" yo'lini ishga tushiradi va operator IKKITA xabar ko'radi,
    // biri yolg'on: hech qanday sessiya bo'lmagan
    stubLogin({
      status: 401,
      body: { error: { code: 'AUTH_UNAUTHORIZED', message: 'Email yoki parol notoʻgʻri' } },
    });

    renderLogin();
    await fillAndSubmit();
    await screen.findByRole('alert');

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(/Sessiya muddati tugadi/)).toBeNull();
  });

  it('★ XATODAN KEYIN PAROL VA KOD TOZALANADI', async () => {
    stubLogin({
      status: 401,
      body: { error: { code: 'AUTH_UNAUTHORIZED', message: 'Email yoki parol notoʻgʻri' } },
    });

    renderLogin();
    await fillAndSubmit();
    await screen.findByRole('alert');

    // TOTP kodi bir martalik va 30 soniyada yangilanadi — eski kod
    // bilan qayta urinish behuda va urinishlar hisobini yeydi
    expect(screen.getByLabelText<HTMLInputElement>('Parol').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Autentifikator kodi').value).toBe('');
    // Email QOLADI: uni qayta yozdirish keraksiz ish
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('admin@karvon.uz');
  });

  it('★ KODDAN RAQAMSIZ BELGILAR OLIB TASHLANADI', async () => {
    stubLogin({ body: {} });
    renderLogin();

    // Autentifikator ilovalari kodni "123 456" ko'rinishida ko'rsatadi
    // va nusxa-ko'chirishda bo'sh joy tushadi
    await userEvent.type(screen.getByLabelText('Autentifikator kodi'), '123 456');

    expect(screen.getByLabelText<HTMLInputElement>('Autentifikator kodi').value).toBe('123456');
  });

  it('★ TARMOQ UZILGANDA SABAB KOʻRSATILADI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderLogin();
    await fillAndSubmit();

    // "Xatolik yuz berdi" o'rniga aniq sabab: operator API ishlamayotganini
    // o'zi tekshirib ko'radi
    expect(await screen.findByRole('alert')).toHaveTextContent('Server bilan aloqa yo‘q');
  });

  it('★ YUBORILAYOTGANDA TUGMA OʻCHADI', async () => {
    // Ikki marta bosish ikkita kirish urinishi degani va u
    // "5 marta noto'g'ri urinish" hisobini tezroq to'ldiradi
    // "Darvoza": javob shu promise hal bo'lgandan keyin qaytadi.
    // Uni `mockImplementation` ichida yasash TypeScript'da ishlamaydi —
    // u callback ichidagi tayinlashni kuzatmaydi va o'zgaruvchini
    // `never` deb hisoblaydi
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        gate.then(() => ({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                accessToken: 't',
                admin: {
                  adminId: 'a',
                  email: 'a@b.uz',
                  fullName: 'A',
                  role: 'SUPER_ADMIN',
                  permissions: ['*'],
                },
              }),
            ),
          json: () => Promise.resolve({}),
        })),
      ),
    );

    renderLogin();
    await fillAndSubmit();

    const button = screen.getByRole('button', { name: 'Kirish' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    openGate();
    await waitFor(() => expect(readToken()).toBe('t'));
  });
});

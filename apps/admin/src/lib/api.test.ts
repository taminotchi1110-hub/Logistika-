import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api, request, setUnauthenticatedHandler } from './api';
import { ApiError } from './api-error';
import { readToken, writeToken } from './token-store';

/**
 * API mijozi.
 *
 * Bu qatlam butun panel uchun yagona kirish nuqtasi: token qo'shish,
 * xatoni tarjima qilish va 401 da chiqarish shu yerda. Bittasi
 * ishlamasa, panel butunlay ishonchsiz bo'ladi.
 */

/** `fetch` o'rniga — haqiqiy tarmoqqa chiqmaslik uchun. */
function mockFetch(response: {
  status?: number;
  body?: unknown;
  text?: string;
}): ReturnType<typeof vi.fn> {
  const status = response.status ?? 200;
  const text =
    response.text ?? (response.body === undefined ? '' : JSON.stringify(response.body));

  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => (text ? Promise.resolve(JSON.parse(text)) : Promise.reject(new Error('bo‘sh'))),
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('request', () => {
  beforeEach(() => {
    setUnauthenticatedHandler(null);
  });

  it('★ TOKEN AVTOMATIK QOʻSHILADI', async () => {
    writeToken('token-abc');
    const fetchMock = mockFetch({ body: { ok: true } });

    await api.get('/admin/me');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('★ KIRISH SOʻROVIDA TOKEN YUBORILMAYDI', async () => {
    // Eski (eskirgan) token bilan kirishga urinish serverda
    // chalkashlik keltirib chiqarishi mumkin
    writeToken('eski-token');
    const fetchMock = mockFetch({ body: { accessToken: 'yangi' } });

    await request('/admin/auth/login', { method: 'POST', body: {}, anonymous: true });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('★ BOʻSH FILTRLAR MANZILGA TUSHMAYDI', async () => {
    const fetchMock = mockFetch({ body: [] });

    await api.get('/admin/users', { search: '', role: undefined, status: 'ACTIVE', limit: 50 });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    // `?role=undefined` serverda validatsiya xatosiga olib keladi
    expect(url).not.toContain('undefined');
    expect(url).not.toContain('search=');
    expect(url).toContain('status=ACTIVE');
    expect(url).toContain('limit=50');
  });

  it('server xatosi ApiError ga aylanadi', async () => {
    mockFetch({
      status: 403,
      body: {
        error: {
          code: 'ADMIN_PERMISSION_DENIED',
          message: 'Bu amal uchun huquq yoʻq: payouts.process',
          requestId: 'req-1',
        },
      },
    });

    const error = await api.get('/admin/payouts').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('ADMIN_PERMISSION_DENIED');
    expect((error as ApiError).isForbidden).toBe(true);
    expect((error as ApiError).requestId).toBe('req-1');
  });

  it('★ 401 DA TOKEN TOZALANADI VA CHIQARISH CHAQIRILADI', async () => {
    writeToken('eskirgan');
    const onUnauthenticated = vi.fn();
    setUnauthenticatedHandler(onUnauthenticated);

    mockFetch({
      status: 401,
      body: { error: { code: 'AUTH_UNAUTHORIZED', message: 'Token eskirgan' } },
    });

    await api.get('/admin/dashboard').catch(() => undefined);

    // Token QOLSA, keyingi so'rovlar ham eskisi bilan ketadi va
    // operator nima bo'layotganini tushunmaydi
    expect(readToken()).toBeNull();
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('★ KIRISH SOʻROVIDAGI 401 CHIQARISHNI CHAQIRMAYDI', async () => {
    const onUnauthenticated = vi.fn();
    setUnauthenticatedHandler(onUnauthenticated);

    mockFetch({
      status: 401,
      body: { error: { code: 'AUTH_UNAUTHORIZED', message: 'Email yoki parol notoʻgʻri' } },
    });

    await request('/admin/auth/login', {
      method: 'POST',
      body: {},
      anonymous: true,
    }).catch(() => undefined);

    // Noto'g'ri parol — "sessiya tugadi" degani emas
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('★ JSON BOʻLMAGAN XATO YIQITMAYDI', async () => {
    // nginx 502 sahifasi yoki timeout — HTML qaytaradi
    mockFetch({ status: 502, text: '<html>Bad Gateway</html>' });

    const error = (await api.get('/admin/dashboard').catch((cause: unknown) => cause)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('HTTP_502');
    expect(error.message).toContain('502');
  });

  it('tarmoq uzilishi alohida ajratiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const error = (await api.get('/admin/me').catch((cause: unknown) => cause)) as ApiError;

    // `isNetwork` — qayta urinish MANTIQIY. 500 da esa so'rov serverga
    // yetgan va uni takrorlash xavfli
    expect(error.isNetwork).toBe(true);
    expect(error.status).toBe(0);
  });

  it('204 va boʻsh tana undefined qaytaradi', async () => {
    mockFetch({ status: 204 });
    await expect(api.get('/admin/something')).resolves.toBeUndefined();
  });
});

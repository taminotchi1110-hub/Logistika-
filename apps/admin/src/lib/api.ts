import { ApiError, errorFromResponse } from './api-error';
import { clearToken, readToken } from './token-store';

/**
 * Admin API mijozi.
 *
 * ODDIY `fetch`, kutubxona YO'Q: panel bir nechta endpointga oddiy
 * GET/POST qiladi, interceptor'lar va retry siyosati kerak emas.
 * Bog'liqlik kamaygani sayin xavfsizlik yangilanishlarini kuzatish
 * osonlashadi — admin panel eng nozik yuza.
 */
const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/v1';

/** So'rov 20 soniyadan uzoq ketmaydi: osilgan spinner xatodan yomon. */
const TIMEOUT_MS = 20_000;

/**
 * 401 kelganda chaqiriladi.
 *
 * NEGA CALLBACK: `api.ts` React'ni bilmaydi va router'ga kira olmaydi.
 * Sessiya provayderi shu joyga o'z ishlov beruvchisini qo'yadi va
 * foydalanuvchini kirish ekraniga olib chiqadi. Aks holda har bir
 * chaqiruv joyida 401 ni tekshirishi kerak bo'lardi va bittasi
 * unutilardi.
 */
let onUnauthenticated: (() => void) | null = null;

export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Kirish so'rovida token bo'lmaydi va 401 ni ushlab olish ham shart emas. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, anonymous = false, signal } = options;

  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      // `undefined` — "filter qo'yilmagan". Uni `?status=undefined`
      // ko'rinishida yuborish serverni validatsiya xatosiga olib keladi
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Tashqi bekor qilish (komponent unmount bo'ldi) ham ishlashi kerak
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch (cause) {
    clearTimeout(timer);
    if (signal?.aborted) {
      // Komponent yopildi — bu xato emas, chaqiruvchi kutmaydi
      throw new ApiError('ABORTED', 'So‘rov bekor qilindi', 0);
    }
    throw new ApiError(
      'NETWORK_ERROR',
      'Server bilan aloqa yo‘q. Internetni va API ishlayotganini tekshiring.',
      0,
      { cause: String(cause) },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = await errorFromResponse(response);

    // TOKEN ESKIRDI: 2 soatdan keyin har qanday chaqiruv 401 beradi.
    // Tokenni DARHOL tozalaymiz — aks holda keyingi so'rovlar ham
    // eskisi bilan ketadi va operator nima bo'layotganini tushunmaydi.
    if (error.isUnauthenticated && !anonymous) {
      clearToken();
      onUnauthenticated?.();
    }

    throw error;
  }

  // 204 va bo'sh tana: `response.json()` xato tashlaydi
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;

  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', ...(query ? { query } : {}), ...(signal ? { signal } : {}) }),

  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),

  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
};

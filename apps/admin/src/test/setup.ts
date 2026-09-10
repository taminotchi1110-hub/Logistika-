import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { clearToken } from '@/lib/token-store';

/**
 * Test muhiti.
 *
 * HAR BIR TESTDAN KEYIN TOZALASH: `sessionStorage` va mock'lar
 * testlar orasida oqib ketsa, bitta test ikkinchisining natijasini
 * o'zgartiradi va yiqilish sababini topish juda qiyin bo'ladi.
 *
 * `clearToken()` HAM chaqiriladi, `sessionStorage.clear()` yetarli
 * emas: token do'koni xotirada ham nusxa saqlaydi (inkognito rejimda
 * `sessionStorage` xato tashlashi mumkin) va u avtomatik tozalanmaydi.
 */
/**
 * `ResizeObserver` — jsdom'da yo'q.
 *
 * Recharts'ning `ResponsiveContainer` i unga tayanadi va usiz butun
 * komponent yiqiladi (`ReferenceError`), ya'ni sahifadagi RAQAMLAR
 * ham chizilmaydi. Bo'sh implementatsiya yetarli: jsdom'da element
 * o'lchami har doim 0 va grafik baribir chizilmaydi — biz uning
 * piksellarini emas, unga berilayotgan ma'lumotni tekshiramiz.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

beforeEach(() => {
  sessionStorage.clear();
  clearToken();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
  clearToken();
});

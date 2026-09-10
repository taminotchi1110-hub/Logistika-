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

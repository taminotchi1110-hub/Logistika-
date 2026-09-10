import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { SessionProvider } from './features/auth/session';
import { ApiError } from './lib/api-error';
import './index.css';

/**
 * So'rov keshi.
 *
 * QAYTA URINISH SIYOSATI MUHIM: admin panelda ba'zi so'rovlarni
 * takrorlash XAVFLI (payout, status o'zgartirish), shuning uchun
 * mutatsiyalar umuman qayta urinmaydi. O'qish so'rovlari esa faqat
 * tarmoq uzilganda bir marta urinadi — 403 yoki 404 ni takrorlashning
 * ma'nosi yo'q va u operatorni kutishga majbur qiladi.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.isNetwork) return failureCount < 1;
        return false;
      },
      // Admin panelda ma'lumot tez o'zgaradi (navbat, shikoyat), lekin
      // har fokusda qayta so'rash serverga behuda yuklama beradi
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('#root topilmadi');

createRoot(container).render(
  <StrictMode>
    {/* SessionProvider router'dan TASHQARIDA: kirmagan holatda router
        umuman qurilmaydi (`app.tsx`), lekin sessiya holati kerak */}
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </SessionProvider>
  </StrictMode>,
);

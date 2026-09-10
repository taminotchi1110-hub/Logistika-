import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
// `vitest/config` — `vite` dan emas: faqat u `test` blokini tanidi,
// aks holda TypeScript "unknown property" deb yiqiladi
import { defineConfig } from 'vitest/config';

/**
 * Vite sozlamalari.
 *
 * PROXY ATAYLAB YO'Q. Odatda dev serverga `/api` proxy qo'yiladi, lekin
 * bizda admin panel ishlab chiqarishda ALOHIDA subdomenda turadi
 * (`admin.karvon.uz`, API esa `api.karvon.uz`) — ya'ni so'rovlar har
 * doim cross-origin. Proxy bu haqiqatni yashiradi va CORS muammosi
 * faqat deploydan keyin ma'lum bo'ladi. Shuning uchun dev'da ham
 * to'g'ridan-to'g'ri API manziliga murojaat qilamiz; `.env` dagi
 * `CORS_ORIGINS` da `http://localhost:5173` allaqachon ruxsat etilgan.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    // 5173 — API'ning CORS ro'yxatidagi port. O'zgartirilsa `.env` ham
    // o'zgarishi kerak, aks holda brauzer so'rovlarni bloklaydi.
    port: 5173,
    strictPort: true,
  },

  build: {
    // Xato izlarini prodda ham o'qish uchun: admin panel ichki vosita,
    // manba kodini yashirishdan ko'ra nosozlikni tez topish muhimroq.
    sourcemap: true,
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});

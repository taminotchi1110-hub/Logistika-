/**
 * Tailwind 3.4 (CSS-first Tailwind 4 emas).
 *
 * NEGA 3.x: mobil ilovaning dizayn tokenlari `design tokens` faylida
 * yozilgan va bu yerda ular JS konfiguratsiyasi orqali takrorlanadi.
 * Tailwind 4 ni tanlash konfiguratsiyani CSS ga ko'chirishni talab
 * qiladi va shu bog'liqlikni murakkablashtiradi.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mobil ilova bilan BIR XIL asosiy rang: operator ko'rgan
        // interfeys foydalanuvchi ko'rgani bilan bir dunyoda bo'lishi kerak
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd2ff',
          300: '#8eb4ff',
          400: '#598bff',
          500: '#3563e9',
          600: '#2447c4',
          700: '#1d399e',
          800: '#1c3282',
          900: '#1c2e6b',
        },
        // Status ranglari: yashil/qizil emas, ma'noli nomlar bilan —
        // ularni bir joyda o'zgartirsa butun panel o'zgaradi
        ok: '#0f8a5f',
        warn: '#b45309',
        danger: '#b42318',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

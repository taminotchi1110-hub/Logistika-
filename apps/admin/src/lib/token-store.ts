/**
 * Admin tokenini saqlash.
 *
 * NEGA `sessionStorage`, `localStorage` EMAS:
 *
 *   1. `localStorage` brauzer yopilgandan keyin ham qoladi. Admin panel
 *      ofisdagi umumiy kompyuterda ochilishi mumkin — keyingi odam
 *      brauzerni ochib, tayyor sessiyaga tushib qolardi.
 *   2. `sessionStorage` yorliq bilan birga o'ladi. Bu "ish joyidan
 *      turib ketdim" holatiga to'g'ri javob.
 *
 * IKKISI HAM XSS'dan HIMOYALAMAYDI. Yagona to'g'ri yechim — `httpOnly`
 * cookie, lekin backend `accessToken` ni javob tanasida qaytaradi
 * (`POST /admin/auth/login`). Cookie'ga o'tish backend o'zgarishini va
 * CSRF himoyasini talab qiladi — bu alohida qadam sifatida rejalashtirilgan.
 * Shu sababli panelda `dangerouslySetInnerHTML` va tashqi skript
 * ISHLATILMAYDI: XSS bo'lmasa, token ham chiqmaydi.
 *
 * Xotirada ham nusxa saqlanadi: `sessionStorage` inkognito rejimda yoki
 * "sayt ma'lumotlarini bloklash" sozlamasida XATO tashlashi mumkin, va
 * bu holda panel ishlashdan to'xtamasligi kerak — shunchaki yangilashda
 * sessiya yo'qoladi.
 */
const STORAGE_KEY = 'karvon.admin.token';

let inMemory: string | null = null;

export function readToken(): string | null {
  if (inMemory) return inMemory;
  try {
    inMemory = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    inMemory = null;
  }
  return inMemory;
}

export function writeToken(token: string): void {
  inMemory = token;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Faqat xotirada qoladi — yangilashda sessiya yo'qoladi, lekin
    // panel ishlaydi
  }
}

export function clearToken(): void {
  inMemory = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Xotira allaqachon tozalandi
  }
}

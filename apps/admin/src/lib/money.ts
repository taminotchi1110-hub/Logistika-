/**
 * Pul bilan ishlash.
 *
 * PUL TIYINDA VA SATR SIFATIDA KELADI (1 so'm = 100 tiyin).
 *
 * Server uni ataylab satr qilib yuboradi: tiyin qiymati
 * `Number.MAX_SAFE_INTEGER` dan (~9·10¹⁵, ya'ni ~90 trillion so'm)
 * oshishi mumkin. Platforma aylanmasi uchun bu chegara uzoq emas va
 * `Number` ga o'tkazish bir kun kelib jimgina noto'g'ri summa
 * ko'rsatardi — hech qanday xato belgisisiz.
 *
 * Shuning uchun barcha arifmetika `BigInt` da.
 */

/** `125000000` → `1 250 000 soʻm`. */
export function formatSoum(tiyin: string): string {
  const negative = tiyin.trim().startsWith('-');
  const soum = absBigInt(tiyin) / 100n;
  const grouped = soum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '−' : ''}${grouped} soʻm`;
}

/**
 * Tiyinni so'mga o'tkazadi — GRAFIK UCHUN.
 *
 * Bu yerda `Number` xavfsiz: grafik nuqtasi kunlik summa va u faqat
 * chiziqning balandligini belgilaydi. Aniq qiymat kerak bo'lgan joyda
 * `formatSoum` ishlatiladi.
 */
export function tiyinToSoum(tiyin: string): number {
  return Number(parseTiyin(tiyin) / 100n);
}

/** Satrni `BigInt` ga — bo'sh va buzuq qiymat nol bo'ladi. */
export function parseTiyin(tiyin: string): bigint {
  const trimmed = (tiyin ?? '').trim();
  if (trimmed === '') return 0n;
  try {
    return BigInt(trimmed);
  } catch {
    // Server kutilmagan qiymat yuborsa, ekran yiqilmasligi kerak
    return 0n;
  }
}

/** Yig'indi — `BigInt` da, satr qaytaradi. */
export function sumTiyin(values: string[]): string {
  return values.reduce((total, value) => total + parseTiyin(value), 0n).toString();
}

function absBigInt(tiyin: string): bigint {
  const value = parseTiyin(tiyin);
  return value < 0n ? -value : value;
}

/**
 * Pul bilan ishlash.
 *
 * ASOSIY QOIDA: pul HAR DOIM butun sonli TIYINDA saqlanadi va `bigint`
 * bilan hisoblanadi. `number` ishlatilmaydi:
 *
 *   0.1 + 0.2 === 0.30000000000000004      ← suzuvchi nuqta
 *   2 ** 53 + 1 === 2 ** 53                ← 90 mlrd so'mdan keyin aniqlik yo'q
 *
 * 90 mlrd so'm — bu platformaning bir yillik aylanmasi darajasi, ya'ni
 * `number` bilan ishlash nazariy emas, amaliy xavf.
 *
 * Bazadan qiymatlar `string` bo'lib keladi (`pg` drayveri INT8 ni shunday
 * qaytarishga sozlangan), shuning uchun bu yerdagi funksiyalar `string`
 * va `bigint` bilan ishlaydi.
 */

/** 1 so'm = 100 tiyin. */
export const TIYIN_PER_SOUM = 100n;

/** Bazadan kelgan qiymatni `bigint` ga o'giradi. */
export function toTiyin(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(`Tiyin butun son boʻlishi kerak: ${value}`);
    }
    return BigInt(value);
  }

  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new TypeError(`Tiyin qiymati notoʻgʻri: "${value}"`);
  }
  return BigInt(trimmed);
}

/**
 * Foiz ulushini hisoblaydi (masalan komissiya).
 *
 * `rate` — 0..1 oralig'idagi son (0.05 = 5%). U 4 kasr xonasigacha
 * yaxlitlanadi va butun songa aylantiriladi, keyin bo'linadi.
 * Natija PASTGA yaxlitlanadi: komissiya hech qachon summadan oshib
 * ketmasligi va haydovchining ulushi manfiy bo'lmasligi kerak.
 */
export function percentOf(amountTiyin: bigint, rate: number): bigint {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new TypeError(`Foiz notoʻgʻri: ${rate}`);
  }

  const scaled = BigInt(Math.round(rate * 10_000));
  const result = (amountTiyin * scaled) / 10_000n;

  // BigInt bo'linishi nolga qarab yaxlitlaydi; manfiy summada bu
  // "yuqoriga" degani bo'lib qoladi, shuning uchun aniq cheklaymiz
  return amountTiyin < 0n ? -absValue(result) : absValue(result);
}

function absValue(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * Tiyinni ko'rsatish uchun formatlaydi: `24000000` → `"240 000 so'm"`.
 *
 * Tiyin qismi odatda ko'rsatilmaydi — O'zbekistonda tiyin muomalada
 * yo'q. `withTiyin` faqat moliyaviy hisobotlarda kerak bo'ladi.
 */
export function formatSoum(amountTiyin: bigint | string, withTiyin = false): string {
  const value = toTiyin(amountTiyin);
  const negative = value < 0n;
  const abs = absValue(value);

  const soum = abs / TIYIN_PER_SOUM;
  const tiyin = abs % TIYIN_PER_SOUM;

  // Uch xonalab ajratish — O'zbekistonda probel ishlatiladi
  const grouped = soum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const suffix = withTiyin ? `,${tiyin.toString().padStart(2, '0')}` : '';

  return `${negative ? '−' : ''}${grouped}${suffix} soʻm`;
}

/** Ko'rsatish uchun qisqa shakl: `24000000` → `"240 ming"`, `2400000000` → `"24 mln"`. */
export function formatSoumShort(amountTiyin: bigint | string): string {
  const soum = toTiyin(amountTiyin) / TIYIN_PER_SOUM;
  const abs = absValue(soum);

  if (abs >= 1_000_000n) {
    const millions = Number(soum) / 1_000_000;
    return `${millions.toFixed(millions % 1 === 0 ? 0 : 1)} mln soʻm`;
  }
  if (abs >= 1_000n) {
    const thousands = Number(soum) / 1_000;
    return `${thousands.toFixed(thousands % 1 === 0 ? 0 : 1)} ming soʻm`;
  }
  return `${soum} soʻm`;
}

/** So'mni tiyinga o'giradi (mijozdan kelgan qiymat uchun). */
export function soumToTiyin(soum: number): bigint {
  if (!Number.isFinite(soum)) throw new TypeError(`Summa notoʻgʻri: ${soum}`);

  // Kasrli so'm bo'lishi mumkin (masalan 1500.50), shuning uchun
  // yaxlitlashdan oldin ko'paytiramiz
  return BigInt(Math.round(soum * 100));
}

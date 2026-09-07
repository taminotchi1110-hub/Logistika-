/**
 * Oʻzbekiston davlat raqamlari.
 *
 * Amaldagi formatlar:
 *   01 A 123 BC   — eng keng tarqalgan (hudud kodi + harf + 3 raqam + 2 harf)
 *   01 123 ABC    — eski namuna (hudud kodi + 3 raqam + 3 harf)
 *   01 A 123 AA   — yuridik shaxs
 * Hudud kodlari: 01–95 (10, 11, … Toshkent shahri 01, viloyatlar 10–95).
 */
const PLATE_PATTERNS = [
  /^(\d{2})([A-Z])(\d{3})([A-Z]{2})$/, // 01A123BC
  /^(\d{2})(\d{3})([A-Z]{3})$/, // 01123ABC
] as const;

/** Amaldagi hudud kodlari — mavjud boʻlmagan kod bilan raqam boʻlmaydi. */
const VALID_REGION_CODES = new Set([
  '01', // Toshkent shahri
  '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', // Toshkent viloyati
  '20', '21', '22', '23', '24', '25', // Sirdaryo
  '30', '31', '32', '33', '34', '35', // Samarqand
  '40', '41', '42', '43', '44', '45', // Buxoro
  '50', '51', '52', '53', '54', '55', // Andijon
  '60', '61', '62', '63', '64', '65', // Fargʻona
  '70', '71', '72', '73', '74', '75', // Namangan
  '80', '81', '82', '83', '84', '85', // Qashqadaryo
  '90', '91', '92', '93', '94', '95', // Surxondaryo / Navoiy / Jizzax / Xorazm / Qoraqalpogʻiston
  '26', '27', '28', '29', '36', '37', '38', '39',
  '46', '47', '48', '49', '56', '57', '58', '59',
  '66', '67', '68', '69', '76', '77', '78', '79',
  '86', '87', '88', '89', '96', '97', '98', '99',
]);

/** Boʻshliq, tire va kichik harflarni tozalab kanonik shaklga keltiradi. */
export function normalizePlate(input: string): string | null {
  if (!input) return null;

  const cleaned = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    // Kirill harflari koʻpincha lotin oʻrniga kiritiladi — almashtiramiz
    .replace(/А/g, 'A')
    .replace(/В/g, 'B')
    .replace(/С/g, 'C')
    .replace(/Е/g, 'E')
    .replace(/Н/g, 'H')
    .replace(/К/g, 'K')
    .replace(/М/g, 'M')
    .replace(/О/g, 'O')
    .replace(/Р/g, 'P')
    .replace(/Т/g, 'T')
    .replace(/Х/g, 'X');

  for (const pattern of PLATE_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (match && VALID_REGION_CODES.has(match[1])) return cleaned;
  }
  return null;
}

export function isValidPlate(input: string): boolean {
  return normalizePlate(input) !== null;
}

/** Koʻrsatish uchun ajratilgan shakl: 01A123BC → 01 A 123 BC */
export function formatPlate(plate: string): string {
  const normalized = normalizePlate(plate);
  if (!normalized) return plate;

  const withLetter = PLATE_PATTERNS[0].exec(normalized);
  if (withLetter) {
    return `${withLetter[1]} ${withLetter[2]} ${withLetter[3]} ${withLetter[4]}`;
  }

  const oldStyle = PLATE_PATTERNS[1].exec(normalized);
  return oldStyle ? `${oldStyle[1]} ${oldStyle[2]} ${oldStyle[3]}` : normalized;
}

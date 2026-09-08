/// O'zbekiston telefon raqamlari.
///
/// Backend E.164 formatini kutadi (`+998901234567`), foydalanuvchi esa
/// odatda `90 123 45 67` yoki `901234567` deb kiritadi. Bu yerdagi
/// funksiyalar ikkala tomonni bog'laydi.
library;

/// O'zbekistondagi mobil operatorlar kodlari.
///
/// Ro'yxat foydalanuvchi xatosini ERTA ushlash uchun: `+998 12 ...`
/// (Toshkent shahar raqami) SMS qabul qila olmaydi va OTP hech qachon
/// kelmaydi. Buni serverga bormasdan aytish yaxshiroq.
/// MUHIM: bu ro'yxat backend'dagi `UZ_MOBILE_PREFIXES` bilan AYNAN
/// mos bo'lishi kerak (apps/api/src/common/utils/phone.util.ts).
/// Farq bo'lsa foydalanuvchi ikki xil natija oladi: ilova raqamni
/// rad etadi, server esa qabul qilardi (yoki aksincha).
const uzbekMobilePrefixes = {
  '20', // Uzmobile (yangi)
  '33', // Humans
  '50', // Perfectum / Uzmobile
  '55', // Uzmobile
  '77', // Uztelecom
  '88', // Humans / Uzmobile
  '90', // Beeline
  '91', // Beeline
  '93', // Ucell
  '94', // Ucell
  '95', // Uzmobile
  '97', // Mobiuz
  '98', // Uzmobile
  '99', // Uzmobile
};

/// Foydalanuvchi kiritgan matnni E.164 ga o'giradi.
///
/// Qabul qiladi: `901234567`, `90 123 45 67`, `+998901234567`,
/// `998901234567`, `8 90 123 45 67`.
/// Qaytaradi: `+998901234567` yoki `null` (noto'g'ri bo'lsa).
String? normalizePhone(String input) {
  var digits = input.replaceAll(RegExp(r'[^\d]'), '');

  // Eski format: 8 bilan boshlanadi (sobiq ittifoq odati)
  if (digits.length == 10 && digits.startsWith('8')) {
    digits = digits.substring(1);
  }
  // Mamlakat kodi bilan
  if (digits.length == 12 && digits.startsWith('998')) {
    digits = digits.substring(3);
  }

  if (digits.length != 9) return null;

  final prefix = digits.substring(0, 2);
  if (!uzbekMobilePrefixes.contains(prefix)) return null;

  return '+998$digits';
}

/// `+998901234567` → `"+998 90 123 45 67"`.
String formatPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'[^\d]'), '');
  if (digits.length != 12 || !digits.startsWith('998')) return phone;

  final local = digits.substring(3);
  return '+998 ${local.substring(0, 2)} ${local.substring(2, 5)} '
      '${local.substring(5, 7)} ${local.substring(7)}';
}

/// Maskalangan raqam: `+998 90 *** ** 67`.
///
/// Backend buyurtma tasdiqlangunicha aynan shu ko'rinishda qaytaradi.
/// Mobil tomonda ham bir xil formatlash kerak — masalan lokal
/// keshdagi raqamni ko'rsatishda.
String maskPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'[^\d]'), '');
  if (digits.length != 12 || !digits.startsWith('998')) return phone;

  final local = digits.substring(3);
  return '+998 ${local.substring(0, 2)} *** ** ${local.substring(7)}';
}

/// Kiritish maydonida ko'rsatish uchun: `901234567` → `"90 123 45 67"`.
///
/// Mamlakat kodi maydonda alohida turadi (`+998` prefiksi), shuning
/// uchun bu yerda faqat 9 xonali qism formatlanadi.
String formatLocalInput(String digits) {
  final clean = digits.replaceAll(RegExp(r'[^\d]'), '');
  final buffer = StringBuffer();

  for (var i = 0; i < clean.length && i < 9; i++) {
    if (i == 2 || i == 5 || i == 7) buffer.write(' ');
    buffer.write(clean[i]);
  }

  return buffer.toString();
}

/// Raqam SMS qabul qila oladimi — kiritish paytida tekshiriladi.
bool isValidUzbekMobile(String input) => normalizePhone(input) != null;

/// Operator nomi — foydalanuvchiga "Beeline raqami" deb ko'rsatish uchun.
String? operatorName(String phone) {
  final normalized = normalizePhone(phone);
  if (normalized == null) return null;

  final prefix = normalized.substring(4, 6);
  return switch (prefix) {
    '90' || '91' => 'Beeline',
    '93' || '94' => 'Ucell',
    '88' => 'Humans',
    '97' => 'Mobiuz',
    '95' || '98' || '99' => 'Uzmobile',
    '33' => 'Humans',
    '55' || '20' => 'Uzmobile',
    '50' => 'Perfectum',
    '77' => 'Uztelecom',
    _ => null,
  };
}

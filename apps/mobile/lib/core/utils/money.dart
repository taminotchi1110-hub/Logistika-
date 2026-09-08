/// Pul bilan ishlash (mobil tomon).
///
/// Backend pulni TIYINDA va SATR sifatida qaytaradi (`"24000000"`).
/// Dart'da `int` 64-bitli, ya'ni tiyinni butun son sifatida saqlash
/// xavfsiz — lekin JSON'dan `double` bo'lib kelib qolmasligi uchun
/// har doim satrdan `BigInt` orqali o'qiymiz.
///
/// `double` ISHLATILMAYDI: `0.1 + 0.2 != 0.3` muammosi mobil tomonda
/// ham bor va u yerda u yanada xavfli — foydalanuvchi ekranda ko'rgan
/// summa serverdagidan farq qilsa, ishonch yo'qoladi.
library;

/// 1 so'm = 100 tiyin.
const int tiyinPerSoum = 100;

/// Backend'dan kelgan qiymatni tiyinga o'giradi.
///
/// `null`, bo'sh satr va noto'g'ri qiymat — 0. Ilova moliyaviy
/// ma'lumot tufayli qulab tushmasligi kerak.
BigInt parseTiyin(Object? value) {
  if (value == null) return BigInt.zero;
  if (value is BigInt) return value;
  if (value is int) return BigInt.from(value);

  final text = value.toString().trim();
  if (text.isEmpty) return BigInt.zero;

  return BigInt.tryParse(text) ?? BigInt.zero;
}

/// `24000000` → `"240 000 so'm"`.
///
/// Uch xonalab ajratishda PROBEL ishlatiladi — O'zbekistonda qabul
/// qilingan format. Vergul yoki nuqta chalkashtiradi: 1,000 ni ba'zi
/// foydalanuvchilar "bir butun nol" deb o'qiydi.
String formatSoum(Object? tiyin, {bool withSuffix = true, bool withTiyin = false}) {
  final value = parseTiyin(tiyin);
  final negative = value.isNegative;
  final abs = value.abs();

  final soum = abs ~/ BigInt.from(tiyinPerSoum);
  final rest = abs % BigInt.from(tiyinPerSoum);

  final grouped = _groupDigits(soum.toString());
  final fraction = withTiyin ? ',${rest.toString().padLeft(2, '0')}' : '';
  final suffix = withSuffix ? ' soʻm' : '';

  return '${negative ? '−' : ''}$grouped$fraction$suffix';
}

/// Qisqa shakl — ro'yxatlarda joy tejash uchun.
///
/// `24000000` → `"240 ming"`, `2400000000` → `"24 mln"`.
String formatSoumShort(Object? tiyin) {
  final soum = parseTiyin(tiyin) ~/ BigInt.from(tiyinPerSoum);
  final abs = soum.abs();

  if (abs >= BigInt.from(1000000)) {
    final millions = soum / BigInt.from(1000000);
    return '${_trimZero(millions)} mln soʻm';
  }
  if (abs >= BigInt.from(1000)) {
    final thousands = soum / BigInt.from(1000);
    return '${_trimZero(thousands)} ming soʻm';
  }
  return '$soum soʻm';
}

/// Foydalanuvchi kiritgan so'mni tiyinga o'giradi.
///
/// Kiritishda probel va boshqa ajratkichlar bo'lishi mumkin
/// (`"240 000"`), ular tashlanadi.
BigInt soumToTiyin(String input) {
  final digits = input.replaceAll(RegExp(r'[^\d]'), '');
  if (digits.isEmpty) return BigInt.zero;

  return BigInt.parse(digits) * BigInt.from(tiyinPerSoum);
}

/// Kiritish maydonida raqamni ajratib ko'rsatish: `240000` → `240 000`.
String groupSoumInput(String input) {
  final digits = input.replaceAll(RegExp(r'[^\d]'), '');
  if (digits.isEmpty) return '';

  return _groupDigits(digits);
}

String _groupDigits(String digits) {
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    // Oxiridan uch xonada bir marta probel
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(digits[i]);
  }
  return buffer.toString();
}

String _trimZero(double value) {
  return value % 1 == 0 ? value.toStringAsFixed(0) : value.toStringAsFixed(1);
}

/// Og'irlikni ko'rsatish: `4000` → `"4 t"`, `750` → `"750 kg"`.
///
/// Tonnaga o'tish chegarasi 1000 kg: yuk e'lonlarida "4000 kg" emas,
/// "4 t" o'qish osonroq va bozorda shunday gapiriladi.
String formatWeight(int kg) {
  if (kg >= 1000) {
    final tons = kg / 1000;
    return '${tons % 1 == 0 ? tons.toStringAsFixed(0) : tons.toStringAsFixed(1)} t';
  }
  return '$kg kg';
}

/// Masofani ko'rsatish: `328.4` → `"328 km"`, `0.8` → `"800 m"`.
String formatDistance(num? km) {
  if (km == null) return '—';
  if (km < 1) return '${(km * 1000).round()} m';
  return '${km.round()} km';
}

/// Davomiylik: `95` → `"1 soat 35 daq"`.
String formatDuration(int? minutes) {
  if (minutes == null || minutes <= 0) return '—';

  final hours = minutes ~/ 60;
  final rest = minutes % 60;

  if (hours == 0) return '$rest daq';
  if (rest == 0) return '$hours soat';
  return '$hours soat $rest daq';
}

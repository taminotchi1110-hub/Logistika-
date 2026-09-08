import 'package:flutter/material.dart';

/// KARVON rang palitrasi.
///
/// FOYDALANISH SHAROITI DIZAYNNI BELGILADI: haydovchi telefonni
/// kabinada, quyosh nurida, ba'zan qo'lqopda ishlatadi. Shuning uchun:
///
///   1. **Yuqori kontrast.** Asosiy matn va fon orasidagi kontrast
///      WCAG AA dan yuqori (4.5:1 emas, 7:1 ga yaqin). Quyoshda ekran
///      yorqinligi yetmaydi va past kontrast umuman o'qilmaydi.
///   2. **Rang yolg'iz ma'no tashimaydi.** Har bir holat rangi bilan
///      birga belgi yoki matn ham bo'ladi — dalton odamlar uchun ham,
///      quyoshda rang buzilganda ham.
///   3. **Yorqin ogohlantirish ranglari.** Yo'l belgilaridagi sariq va
///      qizil — haydovchiga tanish va tez o'qiladi.
abstract final class AppColors {
  // --- asosiy ---
  /// Karvon ko'ki — ishonch va barqarorlik. Logistikada an'anaviy.
  static const primary = Color(0xFF0F62A8);
  static const primaryDark = Color(0xFF0A4880);
  static const primaryLight = Color(0xFFE8F1FA);

  /// Yo'l belgilaridagi sariq — harakatga chorlovchi elementlar.
  static const accent = Color(0xFFF5A623);
  static const accentDark = Color(0xFFD98C0A);
  static const accentLight = Color(0xFFFEF6E7);

  // --- holat ranglari ---
  static const success = Color(0xFF0E9F6E);
  static const successLight = Color(0xFFE6F6F0);
  static const danger = Color(0xFFE02424);
  static const dangerLight = Color(0xFFFDECEC);
  static const warning = Color(0xFFFF8A00);
  static const warningLight = Color(0xFFFFF4E5);
  static const info = Color(0xFF3B82F6);
  static const infoLight = Color(0xFFEAF2FE);

  // --- neytral ---
  static const black = Color(0xFF0D1117);
  static const gray900 = Color(0xFF1A1F26);
  static const gray700 = Color(0xFF3D454F);
  static const gray500 = Color(0xFF6B7480);
  static const gray400 = Color(0xFF9AA2AD);
  static const gray300 = Color(0xFFC9CFD6);
  static const gray200 = Color(0xFFE3E7EB);
  static const gray100 = Color(0xFFF1F3F5);
  static const gray50 = Color(0xFFF8F9FA);
  static const white = Color(0xFFFFFFFF);

  // --- semantik ---
  static const background = gray50;
  static const surface = white;
  static const border = gray200;
  static const textPrimary = gray900;
  static const textSecondary = gray500;
  static const textDisabled = gray400;

  /// Buyurtma holatlari uchun ranglar.
  ///
  /// Har bir bosqich o'z rangiga ega: haydovchi ekranga qarab, matnni
  /// o'qimasdan ham qaysi bosqichda ekanini biladi.
  static const statusAssigned = info;
  static const statusConfirmed = primary;
  static const statusEnRoute = accent;
  static const statusLoaded = Color(0xFF8B5CF6);
  static const statusInTransit = Color(0xFF6366F1);
  static const statusDelivered = success;
  static const statusCancelled = danger;
}

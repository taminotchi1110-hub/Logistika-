import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_colors.dart';

/// O'lchov birliklari — bitta joyda.
///
/// Flutter'da `EdgeInsets.all(16)` yozish oson, lekin 40 ta faylda
/// turlicha qiymatlar paydo bo'ladi va interfeys "qalqib" ketadi.
/// Bu yerdagi shkala 4 ga karrali: 4, 8, 12, 16, 20, 24, 32.
abstract final class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
  static const xxxl = 32.0;
}

abstract final class AppRadius {
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const pill = 999.0;
}

/// Minimal teginish maydoni.
///
/// Material tavsiyasi 48dp. Bizda 52dp: haydovchi harakatlanayotgan
/// mashinada, ba'zan qo'lqopda bosadi. Qo'shimcha 4dp — arzon sug'urta.
abstract final class AppSizes {
  static const minTouchTarget = 52.0;
  static const buttonHeight = 52.0;
  static const inputHeight = 52.0;
  static const iconSm = 18.0;
  static const iconMd = 24.0;
  static const iconLg = 32.0;
}

abstract final class AppTheme {
  static ThemeData get light {
    const base = ColorScheme.light(
      primary: AppColors.primary,
      onPrimary: AppColors.white,
      primaryContainer: AppColors.primaryLight,
      onPrimaryContainer: AppColors.primaryDark,
      secondary: AppColors.accent,
      onSecondary: AppColors.black,
      error: AppColors.danger,
      onError: AppColors.white,
      surface: AppColors.surface,
      onSurface: AppColors.textPrimary,
      outline: AppColors.border,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: base,
      scaffoldBackgroundColor: AppColors.background,
      // fontFamily: 'Inter' — shrift fayllari qo'shilgach yoqiladi
      // (pubspec.yaml dagi izohga qarang)

      // Status bar matni qorong'i — bizning fon ochiq rangda
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
          statusBarBrightness: Brightness.light,
        ),
        titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
      ),

      textTheme: _textTheme,

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size.fromHeight(AppSizes.buttonHeight),
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.white,
          disabledBackgroundColor: AppColors.gray200,
          disabledForegroundColor: AppColors.gray400,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(AppSizes.buttonHeight),
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.border, width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(0, AppSizes.minTouchTarget),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.lg,
        ),
        border: _inputBorder(AppColors.border),
        enabledBorder: _inputBorder(AppColors.border),
        focusedBorder: _inputBorder(AppColors.primary, width: 2),
        errorBorder: _inputBorder(AppColors.danger),
        focusedErrorBorder: _inputBorder(AppColors.danger, width: 2),
        hintStyle: const TextStyle(color: AppColors.textDisabled, fontSize: 16),
        // Xato matni har doim ko'rinadi — joy oldindan ajratilgan bo'lsa
        // forma "sakramaydi"
        errorMaxLines: 2,
      ),

      cardTheme: CardTheme(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          side: const BorderSide(color: AppColors.border),
        ),
      ),

      chipTheme: ChipThemeData(
        backgroundColor: AppColors.gray100,
        selectedColor: AppColors.primaryLight,
        labelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppColors.textPrimary,
        ),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
          side: const BorderSide(color: AppColors.border),
        ),
      ),

      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.gray400,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
        selectedLabelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
      ),

      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
      ),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.gray900,
        contentTextStyle: const TextStyle(
          fontSize: 15,
          color: AppColors.white,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
      ),
    );
  }

  static OutlineInputBorder _inputBorder(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.md),
      borderSide: BorderSide(color: color, width: width),
    );
  }

  /// Shrift shkalasi.
  ///
  /// Eng kichik o'lcham — 13. Undan pastda quyoshda va harakatlanayotgan
  /// mashinada o'qib bo'lmaydi. Narx va summalar uchun alohida yirik
  /// uslub bor: bu ekrandagi eng muhim raqam.
  static const _textTheme = TextTheme(
    displayLarge: TextStyle(fontSize: 32, fontWeight: FontWeight.w700, height: 1.2),
    displayMedium: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, height: 1.2),
    headlineLarge: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, height: 1.25),
    headlineMedium: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, height: 1.3),
    titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, height: 1.35),
    titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.4),
    bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.5),
    bodyMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w400, height: 1.5),
    bodySmall: TextStyle(fontSize: 13, fontWeight: FontWeight.w400, height: 1.45),
    labelLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.4),
    labelMedium: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, height: 1.4),
  );
}

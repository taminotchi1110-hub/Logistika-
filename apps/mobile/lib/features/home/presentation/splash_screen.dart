import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/karvon_logo.dart';

/// Ilova ochilishidagi ekran.
///
/// Bu yerda saqlangan sessiya tekshiriladi. Foydalanuvchi buni
/// odatda ko'rmaydi (100-300 ms), lekin internet sekin bo'lsa
/// ko'radi — shuning uchun bo'sh oq ekran emas, brend ko'rsatiladi.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    // `build` ichida emas: provayder holatini widget qurilayotganda
    // o'zgartirish Flutter'da xato beradi
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authStateProvider.notifier).restore();
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Tizim splash'i ham shu ko'k fonda «K✓» ni ko'rsatadi —
            // o'tish sakrashsiz, belgi to'liq logotipga aylanadi
            KarvonLogo(capHeight: 36, color: AppColors.white),
            SizedBox(height: AppSpacing.xxxl),
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation(AppColors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

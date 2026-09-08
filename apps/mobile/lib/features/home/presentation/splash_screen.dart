import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';

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
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'KARVON',
              style: Theme.of(context).textTheme.displayMedium?.copyWith(
                    color: AppColors.white,
                    letterSpacing: 3,
                  ),
            ),
            const SizedBox(height: AppSpacing.xxxl),
            const SizedBox(
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

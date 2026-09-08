import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class KarvonApp extends ConsumerWidget {
  const KarvonApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'KARVON',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      // Qorong'i mavzu keyingi bosqichda: haydovchi kechasi ishlaydi va
      // yorqin ekran ko'zni charchatadi
      themeMode: ThemeMode.light,
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) {
        // Tizim shrift o'lchamini cheklaymiz: 200% da interfeys buziladi.
        // 130% gacha ruxsat — bu yoshi katta foydalanuvchilar uchun yetarli.
        final scale = MediaQuery.textScalerOf(context).clamp(
          minScaleFactor: 1,
          maxScaleFactor: 1.3,
        );
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: scale),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}

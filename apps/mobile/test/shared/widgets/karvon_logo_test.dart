import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/shared/widgets/karvon_logo.dart';

/// Logotip rasm emas, chiziladi. Shuning uchun uning nisbati brend
/// fayli (brand/logo/karvon-logo.svg) bilan bir xil ekani va ekran
/// oʻqigich uni nomi bilan aytishi alohida tekshiriladi.
void main() {
  Widget wrap(Widget child) => Directionality(
        textDirection: TextDirection.ltr,
        child: Center(child: child),
      );

  testWidgets('★ EKRAN OʻQIGICH LOGOTIPNI «KARVON» DEB AYTADI', (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(wrap(const KarvonLogo()));

    expect(find.bySemanticsLabel('KARVON'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('★ OʻLCHAM BOSH HARF BALANDLIGIDAN KELIB CHIQADI', (tester) async {
    await tester.pumpWidget(wrap(const KarvonLogo(capHeight: 40)));
    final size = tester.getSize(find.byType(KarvonLogo));

    // Belgining uchi harflardan ~5% yuqoriga chiqadi, O esa biroz pastga
    expect(size.height, closeTo(40 * 1588 / 1490, 0.01));
    // SVG logotip bilan bir xil nisbat: 592.47 × 106.58 (padding'siz)
    expect(size.width / size.height, closeTo(592.47 / 106.58, 0.001));
  });
}

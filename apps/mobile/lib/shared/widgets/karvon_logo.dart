import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// KARVON logotipi — «KAR✓ON»: V harfi o'rnida tasdiq belgisi
/// (kafolatli to'lov, tekshirilgan haydovchilar).
///
/// RASM FAYLI EMAS — CHIZILADI. Harflar ilovaning o'z shrifti Inter Bold
/// bilan, belgi esa chiziq sifatida. Shuning uchun istalgan o'lchamda
/// tiniq, har ekran zichligi uchun alohida PNG kerak emas va rangi fonga
/// qarab almashadi. Geometriya `brand/logo/karvon-logo.svg` bilan aynan
/// bir xil: biri o'zgarsa, ikkinchisi ham o'zgarishi kerak.
class KarvonLogo extends StatelessWidget {
  const KarvonLogo({
    this.capHeight = 32,
    this.color = AppColors.primaryDark,
    this.checkColor = AppColors.accent,
    super.key,
  });

  /// Bosh harflar balandligi, logical px. Widget biroz balandroq:
  /// belgining uchi harflardan ~5% yuqoriga chiqadi.
  final double capHeight;

  /// Harflar rangi. Ko'k yoki to'q fonda — [AppColors.white].
  final Color color;

  /// Tasdiq belgisi rangi — brend sarig'i, fondan qat'i nazar.
  final Color checkColor;

  @override
  Widget build(BuildContext context) {
    final unit = capHeight / _capUnits;

    // Ekran o'qigich logotipni nomi bilan aytadi. Nom TARJIMA
    // QILINMAYDI — u brend, uch tilda bir xil.
    return Semantics(
      container: true,
      image: true,
      label: 'KARVON',
      child: CustomPaint(
        size: Size((_inkRight - _inkLeft) * unit, (_inkTop + _inkBottom) * unit),
        painter: _KarvonLogoPainter(unit: unit, color: color, checkColor: checkColor),
      ),
    );
  }
}

// Inter Bold v4.1 o'lchovlari, shrift birliklarida (1 em = 2048).
// Harf o'rni = oldingi harf kengligi + kerning + 0.02 em trekking.
// Shrift versiyasi yangilansa, shu qiymatlar ham tekshiriladi.
const double _em = 2048;
const double _capUnits = 1490;
const double _tracking = 0.02 * _em;
const double _kX = 0;
const double _aX = _kX + 1473 + _tracking;
const double _rX = _aX + 1529 + _tracking;
const double _vX = _rX + 1345 - 40 + _tracking; // R–V kerning: −40
const double _oX = _vX + 1529 - 82 + _tracking; // V–O kerning: −82
const double _nX = _oX + 1578 + _tracking;

const double _inkLeft = 135; // K ning chap bo'shlig'i — rasm shu yerdan boshlanadi
const double _inkRight = _nX + 1426; // N ning o'ng cheti
const double _inkTop = 1418 + _checkStroke / 2; // belgining yumaloq uchi
const double _inkBottom = 20; // O tayanch chiziqdan biroz pastga tushadi

const _letters = <(String, double)>[('K', _kX), ('A', _aX), ('R', _rX), ('O', _oX), ('N', _nX)];

// Tasdiq belgisining o'rta chizig'i: V boshidan, tayanch chiziqdan yuqoriga.
// Qalinligi — Inter Bold harflari qalinligi.
const _checkPoints = [Offset(235, 790), Offset(650, 150), Offset(1322, 1418)];
const double _checkStroke = 300;

class _KarvonLogoPainter extends CustomPainter {
  const _KarvonLogoPainter({
    required this.unit,
    required this.color,
    required this.checkColor,
  });

  /// Bitta shrift birligi necha logical px.
  final double unit;
  final Color color;
  final Color checkColor;

  @override
  void paint(Canvas canvas, Size size) {
    final baseline = _inkTop * unit;
    final style = TextStyle(
      fontFamily: 'Inter',
      fontWeight: FontWeight.w700,
      fontSize: _em * unit,
      height: 1,
      color: color,
    );

    // Har harf alohida, aniq o'rniga. TextStyle.letterSpacing oxirgi
    // harfdan keyin ham bo'sh joy qo'shadi — V ning o'rni siljib ketardi.
    for (final (letter, x) in _letters) {
      final painter = TextPainter(
        text: TextSpan(text: letter, style: style),
        textDirection: TextDirection.ltr,
      )..layout();
      final ascent = painter.computeDistanceToActualBaseline(TextBaseline.alphabetic);
      painter.paint(canvas, Offset((x - _inkLeft) * unit, baseline - ascent));
      painter.dispose();
    }

    final check = Path()
      ..addPolygon(
        [
          for (final p in _checkPoints) Offset((_vX + p.dx - _inkLeft) * unit, baseline - p.dy * unit),
        ],
        false,
      );
    canvas.drawPath(
      check,
      Paint()
        ..color = checkColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = _checkStroke * unit
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_KarvonLogoPainter oldDelegate) =>
      oldDelegate.unit != unit || oldDelegate.color != color || oldDelegate.checkColor != checkColor;
}

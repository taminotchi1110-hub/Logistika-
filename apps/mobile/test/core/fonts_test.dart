import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

/// Shrift qamrovini tekshiradi.
///
/// NEGA BU TEST BOR: o'zbek lotin alifbosidagi `ʻ` (U+02BB) belgisi
/// har bir shriftda ham yo'q. U yo'q bo'lsa `oʻ` va `gʻ` harflari
/// kvadrat bo'lib chiziladi — bu BUTUN ILOVA bo'ylab ko'rinadigan
/// nuqson va uni faqat ekranga qarab payqash mumkin.
///
/// Test shriftning `cmap` jadvalini o'qiydi va kerakli belgilar
/// borligini tekshiradi. Shrift almashtirilsa yoki og'irlik
/// qo'shilsa, xato darhol chiqadi.
void main() {
  const fontDir = 'assets/fonts';

  const weights = [
    'Inter-Regular.ttf',
    'Inter-Medium.ttf',
    'Inter-SemiBold.ttf',
    'Inter-Bold.ttf',
  ];

  /// Interfeys ishlashi uchun zarur belgilar.
  const required = <int, String>{
    0x02BB: 'ʻ — oʻ va gʻ (rasmiy oʻzbek lotin alifbosi)',
    0x02BC: 'ʼ — tutuq belgisi',
    0x2019: '’ — muqobil apostrof',
    0x045E: 'ў — kirill oʻ',
    0x0493: 'ғ — kirill gʻ',
    0x049B: 'қ — kirill q',
    0x04B3: 'ҳ — kirill h',
    0x2116: '№ — buyurtma raqami',
    0x2605: '★ — reyting',
    0x2013: '– — sana oraligʻi',
    0x2212: '− — manfiy balans',
  };

  for (final weight in weights) {
    test('$weight — kerakli belgilar bor', () {
      final file = File('$fontDir/$weight');
      expect(
        file.existsSync(),
        isTrue,
        reason: '$weight topilmadi. pubspec.yaml dagi eʼlon bilan mos emas.',
      );

      final codepoints = _readCmap(file.readAsBytesSync());

      final missing = required.entries
          .where((entry) => !codepoints.contains(entry.key))
          .map((entry) => entry.value)
          .toList();

      expect(
        missing,
        isEmpty,
        reason: '$weight da quyidagi belgilar yoʻq:\n  ${missing.join('\n  ')}',
      );
    });
  }

  test('shrift litsenziyasi ilova bilan birga tarqatiladi', () {
    // OFL talabi: litsenziya matni tarqatishga qoʻshilishi shart
    expect(File('$fontDir/Inter-LICENSE.txt').existsSync(), isTrue);
  });
}

/// TTF `cmap` jadvalidan qo'llab-quvvatlanadigan kod nuqtalarini o'qiydi.
///
/// Faqat Unicode subtable'lari (format 4 va 12) o'qiladi — zamonaviy
/// shriftlarda boshqasi uchramaydi.
Set<int> _readCmap(Uint8List bytes) {
  final data = ByteData.sublistView(bytes);

  final numTables = data.getUint16(4);
  int? cmapOffset;

  for (var i = 0; i < numTables; i++) {
    final base = 12 + i * 16;
    final tag = String.fromCharCodes(bytes.sublist(base, base + 4));
    if (tag == 'cmap') {
      cmapOffset = data.getUint32(base + 8);
      break;
    }
  }

  if (cmapOffset == null) throw StateError('cmap jadvali topilmadi');

  final numSubtables = data.getUint16(cmapOffset + 2);
  int? best;

  for (var i = 0; i < numSubtables; i++) {
    final record = cmapOffset + 4 + i * 8;
    final platformId = data.getUint16(record);
    final encodingId = data.getUint16(record + 2);
    final offset = data.getUint32(record + 4);

    // Windows Unicode: BMP (3,1) yoki toʻliq (3,10)
    if (platformId == 3 && (encodingId == 1 || encodingId == 10)) {
      best = cmapOffset + offset;
      if (encodingId == 1) break;
    }
  }

  if (best == null) throw StateError('Unicode cmap subtable topilmadi');

  final format = data.getUint16(best);
  final result = <int>{};

  if (format == 4) {
    final segCountX2 = data.getUint16(best + 6);
    final endBase = best + 14;
    final startBase = endBase + segCountX2 + 2;

    for (var s = 0; s < segCountX2 ~/ 2; s++) {
      final end = data.getUint16(endBase + s * 2);
      final start = data.getUint16(startBase + s * 2);
      if (start == 0xFFFF) continue;
      for (var cp = start; cp <= end && cp != 0xFFFF; cp++) {
        result.add(cp);
      }
    }
  } else if (format == 12) {
    final groups = data.getUint32(best + 12);
    for (var g = 0; g < groups; g++) {
      final record = best + 16 + g * 12;
      final start = data.getUint32(record);
      final end = data.getUint32(record + 4);
      for (var cp = start; cp <= end; cp++) {
        result.add(cp);
      }
    }
  } else {
    throw StateError('cmap format $format qoʻllab-quvvatlanmaydi');
  }

  return result;
}

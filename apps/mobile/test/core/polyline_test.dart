import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/utils/polyline.dart';
import 'package:latlong2/latlong.dart';

/// Google Encoded Polyline dekoderi.
///
/// Backend marshrutni shu formatda yuboradi. Xato bo'lsa xaritada
/// marshrut butunlay noto'g'ri joyda chiziladi — va buni sezish qiyin,
/// chunki chiziq baribir "chiroyli" ko'rinadi.
///
/// TO'G'RILIK NUQTASI — Google spetsifikatsiyasidagi rasmiy misol.
/// Qolgan testlar quyidagi kodlagich bilan aylanma (round-trip)
/// tekshiradi: u backend'dagi `encodePolyline` ning aynan nusxasi.
void main() {
  /// Backend `polyline.ts` dagi `encodeValue` ning aynan nusxasi.
  String encodeValue(int value) {
    var v = value < 0 ? ~(value << 1) : value << 1;
    final result = StringBuffer();
    while (v >= 0x20) {
      result.writeCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    result.writeCharCode(v + 63);
    return result.toString();
  }

  String encode(List<LatLng> points) {
    var previousLat = 0;
    var previousLng = 0;
    final result = StringBuffer();

    for (final point in points) {
      final lat = (point.latitude * 1e5).round();
      final lng = (point.longitude * 1e5).round();
      result.write(encodeValue(lat - previousLat));
      result.write(encodeValue(lng - previousLng));
      previousLat = lat;
      previousLng = lng;
    }
    return result.toString();
  }

  test('★ GOOGLE HUJJATIDAGI MISOL', () {
    // Rasmiy spetsifikatsiyadagi namuna:
    // (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    final points = decodePolyline(r'_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(points, hasLength(3));
    expect(points[0].latitude, closeTo(38.5, 1e-5));
    expect(points[0].longitude, closeTo(-120.2, 1e-5));
    expect(points[1].latitude, closeTo(40.7, 1e-5));
    expect(points[1].longitude, closeTo(-120.95, 1e-5));
    expect(points[2].latitude, closeTo(43.252, 1e-5));
    expect(points[2].longitude, closeTo(-126.453, 1e-5));
  });

  test('bitta nuqta — Toshkent markazi', () {
    final points = decodePolyline(encode([const LatLng(41.3111, 69.2797)]));

    expect(points, hasLength(1));
    expect(points.first.latitude, closeTo(41.3111, 1e-5));
    expect(points.first.longitude, closeTo(69.2797, 1e-5));
  });

  test('boʻsh satr — boʻsh roʻyxat', () {
    expect(decodePolyline(''), isEmpty);
  });

  test('★ BUZILGAN SATRDA CHEKSIZ SIKL BOʻLMAYDI', () {
    // Chala tugagan satr: dekoder toʻxtashi va qulab tushmasligi kerak
    expect(() => decodePolyline('_p~iF~ps|U_ulL'), returnsNormally);
    expect(decodePolyline('_p~iF~ps|U_ulL'), hasLength(1));

    // Faqat davomiylik bitlari — hech qachon tugamaydigan qiymat
    expect(() => decodePolyline('~~~~~~~~~~~~~~~~'), returnsNormally);
  });

  test('★ ORQAGA QAYTISH (MANFIY SILJISH)', () {
    // Haydovchi burilib qaytdi — koordinata kamayadi
    const route = [
      LatLng(41.3111, 69.2797),
      LatLng(41.3200, 69.2900),
      LatLng(41.3111, 69.2797),
    ];

    final points = decodePolyline(encode(route));

    expect(points, hasLength(3));
    expect(points[2].latitude, closeTo(route[0].latitude, 1e-5));
    expect(points[2].longitude, closeTo(route[0].longitude, 1e-5));
  });

  test('janubiy va gʻarbiy yarim shar', () {
    const route = [LatLng(-33.8688, 151.2093), LatLng(-34.0, -58.4)];
    final points = decodePolyline(encode(route));

    expect(points[0].latitude, closeTo(-33.8688, 1e-5));
    expect(points[1].longitude, closeTo(-58.4, 1e-5));
  });

  test('★ UZUN MARSHRUT TOʻLIQ OʻQILADI', () {
    // 5 soatlik reysda ~1800 nuqta boʻladi — dekoder ularni
    // yoʻqotmasligi kerak
    final route = [
      for (var i = 0; i < 1800; i++)
        LatLng(41.3111 - i * 0.0001, 69.2797 + i * 0.0001),
    ];

    final points = decodePolyline(encode(route));

    expect(points, hasLength(1800));
    expect(points.first.latitude, closeTo(41.3111, 1e-5));
    expect(points.last.latitude, closeTo(route.last.latitude, 1e-5));
    expect(points.last.longitude, closeTo(route.last.longitude, 1e-5));
  });
}

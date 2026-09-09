import 'package:latlong2/latlong.dart';

/// Google Encoded Polyline Algorithm Format — dekodlash.
///
/// Backend marshrutni shu formatda yuboradi (`apps/api/.../polyline.ts`).
/// 5 soatlik reysda ~1800 nuqta JSON massiv sifatida ~60 KB, polyline
/// sifatida ~9 KB — mobil internetda bu sezilarli farq.
///
/// KUTUBXONA QO'SHILMADI: algoritm 25 qator va hech qachon o'zgarmaydi.
/// Qo'shimcha qaramlik esa ilova hajmini oshiradi va yangilanish
/// talab qiladi.
List<LatLng> decodePolyline(String encoded) {
  final points = <LatLng>[];

  var index = 0;
  var lat = 0;
  var lng = 0;

  while (index < encoded.length) {
    final latDelta = _decodeValue(encoded, index);
    if (latDelta == null) break;
    index = latDelta.nextIndex;
    lat += latDelta.value;

    final lngDelta = _decodeValue(encoded, index);
    if (lngDelta == null) break;
    index = lngDelta.nextIndex;
    lng += lngDelta.value;

    // Aniqlik — 5 kasr xonasi (~1.1 m ekvatorda)
    points.add(LatLng(lat / 1e5, lng / 1e5));
  }

  return points;
}

/// Bitta qiymatni o'qiydi. `null` — satr chala tugagan.
({int value, int nextIndex})? _decodeValue(String encoded, int start) {
  var index = start;
  var shift = 0;
  var result = 0;
  int byte;

  do {
    if (index >= encoded.length) return null;
    byte = encoded.codeUnitAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
    // Buzilgan satrda cheksiz sikl bo'lmasligi uchun
    if (shift > 35) return null;
  } while (byte >= 0x20);

  // Toq son — manfiy qiymat (zigzag kodlash)
  final value = (result & 1) != 0 ? ~(result >> 1) : result >> 1;
  return (value: value, nextIndex: index);
}

/**
 * Google Encoded Polyline Algorithm Format.
 *
 * NEGA KERAK: yakunlangan buyurtma marshruti `order_tracks.polyline` da
 * bitta satr sifatida saqlanadi. 5 soatlik reysda 10 soniyalik interval
 * bilan ~1800 nuqta yig'iladi. JSON massiv sifatida bu ~60 KB, polyline
 * sifatida ~9 KB — va u xaritada to'g'ridan-to'g'ri chiziladi
 * (Google Maps va Leaflet ikkalasi ham shu formatni tushunadi).
 *
 * Kutubxona qo'shmadik: algoritm 30 qator va o'zgarmaydi.
 */

/** Ortiqcha nuqtalarni tashlash uchun minimal siljish (taxminan 10 m). */
const SIMPLIFY_EPSILON = 0.0001;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Bitta sonni polyline formatiga o'giradi. */
function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let result = '';

  while (v >= 0x20) {
    result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  result += String.fromCharCode(v + 63);

  return result;
}

/**
 * Nuqtalar ro'yxatini polyline satriga o'giradi.
 *
 * Aniqlik — 5 kasr xonasi (~1.1 m ekvatorda). Bu GPS aniqligidan
 * yaxshiroq, shuning uchun ma'lumot yo'qolmaydi.
 */
export function encodePolyline(points: LatLng[]): string {
  let previousLat = 0;
  let previousLng = 0;
  let result = '';

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);

    result += encodeValue(lat - previousLat);
    result += encodeValue(lng - previousLng);

    previousLat = lat;
    previousLng = lng;
  }

  return result;
}

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const axis of ['lat', 'lng'] as const) {
      let shift = 0;
      let result = 0;
      let byte: number;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += delta;
      else lng += delta;
    }

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Marshrutni soddalashtiradi: turgan joyda yig'ilgan o'nlab bir xil
 * nuqta o'rniga bittasi qoladi.
 *
 * NEGA ODDIY USUL: Douglas-Peucker aniqroq, lekin bu yerda maqsad —
 * xaritada chiroyli chiziq emas, arxiv hajmini kamaytirish. Svetoforda
 * 5 daqiqa turgan mashina 30 ta bir xil nuqta yozadi; ularning
 * hammasini saqlash ma'nosiz. Birinchi va oxirgi nuqta doim qoladi.
 */
export function simplify(points: LatLng[], epsilon = SIMPLIFY_EPSILON): LatLng[] {
  if (points.length <= 2) return [...points];

  const result: LatLng[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const last = result[result.length - 1];
    const moved =
      Math.abs(points[i].lat - last.lat) > epsilon ||
      Math.abs(points[i].lng - last.lng) > epsilon;

    if (moved) result.push(points[i]);
  }

  result.push(points[points.length - 1]);
  return result;
}

/**
 * Ikki nuqta orasidagi masofa (km) — haversine.
 *
 * PostGIS aniqroq (ellipsoid), lekin bu yerda tezlikni tekshirish va
 * marshrut uzunligini hisoblash uchun ishlatiladi: minglab nuqta uchun
 * bazaga borish o'rniga xotirada hisoblash arzonroq. Farq 0.5% dan kam.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Marshrutning umumiy uzunligi (km). */
export function trackLengthKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

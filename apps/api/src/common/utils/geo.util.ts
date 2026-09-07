export interface Coordinates {
  lat: number;
  lng: number;
}

/** Oʻzbekiston chegaralarining taxminiy ramkasi — kirish maʼlumotini tekshirish uchun. */
export const UZ_BOUNDS = {
  minLat: 37.1,
  maxLat: 45.7,
  minLng: 55.9,
  maxLng: 73.2,
} as const;

const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Ikki nuqta orasidagi **toʻgʻri chiziq** masofasi (km).
 *
 * DIQQAT: bu yoʻl masofasi EMAS. Uni narx hisoblashda ishlatib boʻlmaydi —
 * faqat dastlabki filtr va OSRM ishlamay qolgandagi taxmin uchun.
 * Haqiqiy masofa `RoutingService` orqali olinadi.
 */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Toʻgʻri chiziqni yoʻl masofasiga yaqinlashtirish koeffitsienti.
 *
 * Oʻzbekiston sharoitida: shahar ichida koʻchalar toʻri tufayli farq katta,
 * viloyatlararo esa magistral toʻgʻriroq ketadi. Bu — **taxmin**, shuning
 * uchun prodda OSRM majburiy qilingan (`env.schema.ts`).
 */
export function estimateRoadKm(straightKm: number): number {
  if (straightKm < 15) return straightKm * 1.45;
  if (straightKm < 80) return straightKm * 1.32;
  return straightKm * 1.22;
}

/** Masofaga qarab oʻrtacha tezlik (km/soat) — taxminiy ETA uchun. */
export function estimateDurationMin(roadKm: number): number {
  const avgSpeed = roadKm < 20 ? 22 : roadKm < 100 ? 48 : 62;
  return Math.round((roadKm / avgSpeed) * 60);
}

export function isWithinUzbekistan(point: Coordinates): boolean {
  return (
    point.lat >= UZ_BOUNDS.minLat &&
    point.lat <= UZ_BOUNDS.maxLat &&
    point.lng >= UZ_BOUNDS.minLng &&
    point.lng <= UZ_BOUNDS.maxLng
  );
}

export function isValidCoordinate(point: Coordinates): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

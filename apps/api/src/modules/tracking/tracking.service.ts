import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { DatabaseService } from '@/infra/database/database.service';
import { RedisService } from '@/infra/redis/redis.service';
import {
  TRACKING_STATUSES,
  isTrackingAllowed,
  trackingTarget,
  type OrderStatus,
} from '@/modules/orders/order-status';

import { encodePolyline, haversineKm, simplify, trackLengthKm, type LatLng } from './polyline';

/** Bitta so'rovda nechta nuqta qabul qilinadi (tunnel/oflayn buferi uchun). */
const MAX_POINTS_PER_BATCH = 200;

/** Bundan tez harakat — soxta GPS yoki xato (samolyot ham 900 km/h). */
const IMPLAUSIBLE_SPEED_KMH = 250;

/** Joylashuv shu vaqtdan eski bo'lsa rad etiladi (soat). */
const MAX_POINT_AGE_HOURS = 24;

/** O'rtacha tezlik noma'lum bo'lganda ETA uchun taxmin (km/soat). */
const FALLBACK_SPEED_KMH = 55;

/**
 * `order_tracks.avg_speed_kmh` va `max_speed_kmh` — NUMERIC(5,1),
 * ya'ni eng katta qiymat 9999.9. Buzilgan qurilma vaqti yoki soxta GPS
 * hisobni shundan oshirib yuborishi mumkin va INSERT butunlay yiqiladi
 * ("переполнение поля numeric"). Arxiv esa nizoda kerak bo'ladigan
 * ma'lumot — bitta g'alati tezlik uni yo'qotmasligi kerak, shuning uchun
 * qiymatni chegaraga qisamiz.
 */
const MAX_STORED_SPEED_KMH = 999.9;

function clampSpeed(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0.0';
  return Math.min(value, MAX_STORED_SPEED_KMH).toFixed(1);
}

export interface LocationPoint {
  lat: number;
  lng: number;
  speedKmh?: number;
  headingDeg?: number;
  accuracyM?: number;
  altitudeM?: number;
  batteryPct?: number;
  isMock?: boolean;
  recordedAt?: string;
}

export interface LiveLocation {
  orderId: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
  headingDeg: number | null;
  recordedAt: Date;
  /** Kuzatuv qaysi nuqtaga ketyapti. */
  target: 'PICKUP' | 'DELIVERY';
  targetLat: number;
  targetLng: number;
  distanceToTargetKm: number;
  etaMinutes: number | null;
  status: OrderStatus;
  /** Maʼlumot eskirganmi (haydovchi aloqadan chiqqan). */
  isStale: boolean;
}

interface TrackedOrder {
  orderId: string;
  status: OrderStatus;
  shipperId: string;
  driverId: string;
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
}

/**
 * Jonli GPS kuzatuvi.
 *
 * MAXFIYLIK — ASOSIY QOIDA: haydovchining joylashuvi FAQAT faol
 * buyurtma davomida yoziladi (`TRACKING_STATUSES`). Reysdan tashqarida
 * ilova koordinata yuborsa ham server uni qabul qilmaydi. Bu texnik
 * cheklov emas, mahsulot va'dasi: haydovchi ishlamayotgan paytda
 * kuzatilmasligini bilishi kerak.
 *
 * ISHONCHLILIK: mobil ilova nuqtalarni buferlaydi va aloqa tiklanganda
 * TO'PLAM bo'lib yuboradi. Tunnel yoki tog' yo'lida uzilish normal holat,
 * marshrutda teshik qolmasligi kerak.
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Haydovchining joriy faol buyurtmasi. Yo'q bo'lsa kuzatuv ham yo'q.
   */
  async activeOrderFor(driverId: string): Promise<TrackedOrder | null> {
    const row = await this.database.db
      .selectFrom('orders as o')
      .innerJoin('loads as l', 'l.id', 'o.loadId')
      .select([
        'o.id as orderId',
        'o.status',
        'o.shipperId',
        'o.driverId',
        sql<number>`ST_Y(l.pickup_geom::geometry)`.as('pickupLat'),
        sql<number>`ST_X(l.pickup_geom::geometry)`.as('pickupLng'),
        sql<number>`ST_Y(l.delivery_geom::geometry)`.as('deliveryLat'),
        sql<number>`ST_X(l.delivery_geom::geometry)`.as('deliveryLng'),
      ])
      .where('o.driverId', '=', driverId)
      .where('o.status', 'in', TRACKING_STATUSES)
      .executeTakeFirst();

    return (row as TrackedOrder | undefined) ?? null;
  }

  /**
   * Joylashuvni qabul qiladi.
   *
   * IKKI XIL REJIM — bu maxfiylik qoidasining amaliy ko'rinishi:
   *
   *   `tracking: true`  — faol reys bor. Har bir nuqta `driver_locations`
   *                       ga yoziladi (marshrut tarixi) va mijozga real
   *                       vaqtda uzatiladi.
   *   `tracking: false` — reys yo'q. Faqat `driver_profiles.current_geom`
   *                       yangilanadi — bu matching uchun kerakli KESH,
   *                       bitta joriy nuqta. TARIX YOZILMAYDI.
   *
   * Ya'ni haydovchi ishlamayotgan paytda uning yurgan yo'li saqlanmaydi.
   * Ilova bitta endpointga yozadi, qoidani server qo'llaydi — mijozda
   * "hozir yozsam bo'ladimi?" degan mantiq bo'lishi shart emas.
   */
  async record(
    driverId: string,
    points: LocationPoint[],
  ): Promise<{ tracking: boolean; live: LiveLocation | null }> {
    if (points.length === 0) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Nuqtalar yuborilmadi');
    }
    if (points.length > MAX_POINTS_PER_BATCH) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        `Bir so‘rovda ${MAX_POINTS_PER_BATCH} tadan ko‘p nuqta yuborib bo‘lmaydi`,
      );
    }

    const order = await this.activeOrderFor(driverId);
    const now = Date.now();
    const oldestAllowed = now - MAX_POINT_AGE_HOURS * 3600_000;

    const clean = points
      .map((point) => ({
        ...point,
        at: point.recordedAt ? new Date(point.recordedAt) : new Date(),
      }))
      .filter((point) => {
        const valid =
          Number.isFinite(point.lat) &&
          Number.isFinite(point.lng) &&
          Math.abs(point.lat) <= 90 &&
          Math.abs(point.lng) <= 180 &&
          !Number.isNaN(point.at.getTime()) &&
          point.at.getTime() >= oldestAllowed &&
          // Kelajakdagi vaqt — telefon soati noto'g'ri; 5 daqiqa toqat qilamiz
          point.at.getTime() <= now + 300_000;
        return valid;
      })
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    if (clean.length === 0) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Yaroqli nuqta topilmadi');
    }

    const latestPoint = clean[clean.length - 1];

    // Matching keshi ikkala rejimda ham yangilanadi — bu bitta joriy
    // nuqta, tarix emas
    await this.database.db
      .updateTable('driverProfiles')
      .set({
        currentGeom: sql`ST_SetSRID(ST_MakePoint(${latestPoint.lng}, ${latestPoint.lat}), 4326)::geography`,
        currentGeomAt: latestPoint.at,
      })
      .where('userId', '=', driverId)
      .execute();

    if (!order) {
      // Faol reys yo'q — marshrut tarixi YOZILMAYDI
      return { tracking: false, live: null };
    }

    const previous = await this.lastStoredPoint(order.orderId);
    const suspicious = this.detectImplausibleJump(previous, clean);

    await this.database.db
      .insertInto('driverLocations')
      .values(
        clean.map((point) => ({
          driverId,
          orderId: order.orderId,
          geom: sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography`,
          speedKmh: point.speedKmh === undefined ? null : point.speedKmh.toFixed(1),
          headingDeg: point.headingDeg ?? null,
          accuracyM: point.accuracyM === undefined ? null : point.accuracyM.toFixed(1),
          altitudeM: point.altitudeM === undefined ? null : point.altitudeM.toFixed(1),
          batteryPct: point.batteryPct ?? null,
          isMock: point.isMock === true || suspicious,
          recordedAt: point.at,
        })),
      )
      .execute();

    const latest = latestPoint;

    const live = this.toLive(order, {
      lat: latest.lat,
      lng: latest.lng,
      speedKmh: latest.speedKmh ?? null,
      headingDeg: latest.headingDeg ?? null,
      recordedAt: latest.at,
    });

    // Buyurtma xonasiga uzatamiz — mijoz xaritada markerni siljitadi.
    // Gateway Redis'ga obuna bo'lgani uchun bu kod WebSocket'ni bilmaydi.
    await this.redis.client.publish(
      `track:order:${order.orderId}`,
      JSON.stringify({ ...live, recordedAt: live.recordedAt.toISOString() }),
    );

    if (suspicious) {
      this.logger.warn(
        { driverId, orderId: order.orderId },
        'Shubhali sakrash — nuqtalar is_mock bilan belgilandi',
      );
    }

    return { tracking: true, live };
  }

  /** Buyurtmaning oxirgi joylashuvi (yuk beruvchi va haydovchi uchun). */
  async lastLocation(orderId: string, viewerId: string): Promise<LiveLocation | null> {
    const order = await this.assertAccess(orderId, viewerId);

    if (!isTrackingAllowed(order.status)) return null;

    const point = await this.lastStoredPoint(orderId);
    if (!point) return null;

    return this.toLive(order, point);
  }

  /** Buyurtma marshruti — xaritada chizish uchun. */
  async track(orderId: string, viewerId: string): Promise<{ polyline: string; points: number }> {
    await this.assertAccess(orderId, viewerId);

    // Yakunlangan buyurtmada arxiv bor — xom nuqtalarni o'qish shart emas
    const archived = await this.database.db
      .selectFrom('orderTracks')
      .select(['polyline', 'pointsCount'])
      .where('orderId', '=', orderId)
      .executeTakeFirst();

    if (archived) {
      return { polyline: archived.polyline, points: archived.pointsCount };
    }

    const points = await this.rawPoints(orderId);
    const simplified = simplify(points);

    return { polyline: encodePolyline(simplified), points: simplified.length };
  }

  /**
   * Buyurtma yakunlanganda marshrutni arxivga yozadi.
   *
   * NEGA: `driver_locations` — partitionlangan va vaqt o'tishi bilan
   * eski partitionlar o'chiriladi (saqlash xarajati). Marshrut esa
   * nizoda dalil sifatida kerak bo'lishi mumkin, shuning uchun u
   * siqilgan holda alohida saqlanadi.
   */
  async finalize(orderId: string): Promise<void> {
    const existing = await this.database.db
      .selectFrom('orderTracks')
      .select('orderId')
      .where('orderId', '=', orderId)
      .executeTakeFirst();

    if (existing) return;

    const rows = await this.rawPointRows(orderId);
    if (rows.length < 2) return;

    const points: LatLng[] = rows.map((row) => ({ lat: row.lat, lng: row.lng }));
    const simplified = simplify(points);

    const distanceKm = trackLengthKm(points);
    const first = rows[0].recordedAt.getTime();
    const last = rows[rows.length - 1].recordedAt.getTime();
    const durationMin = Math.max(1, Math.round((last - first) / 60_000));

    const speeds = rows.map((row) => row.speedKmh).filter((s): s is number => s !== null);
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;

    // To'xtashlar: 5 daqiqadan uzoq tanaffus (yuklash, ovqat, tirbandlik)
    let stops = 0;
    for (let i = 1; i < rows.length; i++) {
      const gapMin = (rows[i].recordedAt.getTime() - rows[i - 1].recordedAt.getTime()) / 60_000;
      const movedKm = haversineKm(points[i - 1], points[i]);
      if (gapMin >= 5 && movedKm < 0.2) stops++;
    }

    await this.database.db
      .insertInto('orderTracks')
      .values({
        orderId,
        polyline: encodePolyline(simplified),
        pointsCount: simplified.length,
        distanceKm: distanceKm.toFixed(2),
        durationMin,
        avgSpeedKmh: clampSpeed(distanceKm / (durationMin / 60)),
        maxSpeedKmh: maxSpeed === null ? null : clampSpeed(maxSpeed),
        stopsCount: stops,
      })
      .execute();

    this.logger.log(
      { orderId, points: simplified.length, distanceKm: distanceKm.toFixed(1), durationMin },
      'Marshrut arxivlandi',
    );
  }

  // ------------------------------------------------------------- ichki

  private async assertAccess(orderId: string, viewerId: string): Promise<TrackedOrder> {
    const row = await this.database.db
      .selectFrom('orders as o')
      .innerJoin('loads as l', 'l.id', 'o.loadId')
      .select([
        'o.id as orderId',
        'o.status',
        'o.shipperId',
        'o.driverId',
        sql<number>`ST_Y(l.pickup_geom::geometry)`.as('pickupLat'),
        sql<number>`ST_X(l.pickup_geom::geometry)`.as('pickupLng'),
        sql<number>`ST_Y(l.delivery_geom::geometry)`.as('deliveryLat'),
        sql<number>`ST_X(l.delivery_geom::geometry)`.as('deliveryLng'),
      ])
      .where('o.id', '=', orderId)
      .executeTakeFirst();

    const order = row as TrackedOrder | undefined;

    // Begona buyurtma 404 — mavjudligini ham oshkor qilmaymiz
    if (!order || (order.shipperId !== viewerId && order.driverId !== viewerId)) {
      throw AppError.notFound('Buyurtma topilmadi');
    }

    return order;
  }

  private async lastStoredPoint(orderId: string): Promise<{
    lat: number;
    lng: number;
    speedKmh: number | null;
    headingDeg: number | null;
    recordedAt: Date;
  } | null> {
    const result = await sql<{
      lat: number;
      lng: number;
      speedKmh: string | null;
      headingDeg: number | null;
      recordedAt: Date;
    }>`
      SELECT ST_Y(geom::geometry) AS lat,
             ST_X(geom::geometry) AS lng,
             speed_kmh,
             heading_deg,
             recorded_at
        FROM driver_locations
       WHERE order_id = ${orderId}::uuid
       ORDER BY recorded_at DESC
       LIMIT 1
    `.execute(this.database.db);

    const row = result.rows[0];
    if (!row) return null;

    return {
      lat: Number(row.lat),
      lng: Number(row.lng),
      speedKmh: row.speedKmh === null ? null : Number(row.speedKmh),
      headingDeg: row.headingDeg,
      recordedAt: row.recordedAt,
    };
  }

  private async rawPointRows(orderId: string): Promise<
    { lat: number; lng: number; speedKmh: number | null; recordedAt: Date }[]
  > {
    const result = await sql<{
      lat: number;
      lng: number;
      speedKmh: string | null;
      recordedAt: Date;
    }>`
      SELECT ST_Y(geom::geometry) AS lat,
             ST_X(geom::geometry) AS lng,
             speed_kmh,
             recorded_at
        FROM driver_locations
       WHERE order_id = ${orderId}::uuid
       ORDER BY recorded_at ASC
    `.execute(this.database.db);

    return result.rows.map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lng),
      speedKmh: row.speedKmh === null ? null : Number(row.speedKmh),
      recordedAt: row.recordedAt,
    }));
  }

  private async rawPoints(orderId: string): Promise<LatLng[]> {
    const rows = await this.rawPointRows(orderId);
    return rows.map((row) => ({ lat: row.lat, lng: row.lng }));
  }

  /**
   * Soxta GPS aniqlash: oldingi nuqtadan hozirgisiga fizik jihatdan
   * imkonsiz tezlikda o'tish. Nuqtalarni RAD ETMAYMIZ — ular `is_mock`
   * bilan belgilanadi va admin panelida ko'rinadi. Rad etish xavfli:
   * GPS xatosi ham shunday ko'rinishi mumkin va marshrutda teshik qoladi.
   */
  private detectImplausibleJump(
    previous: { lat: number; lng: number; recordedAt: Date } | null,
    points: { lat: number; lng: number; at: Date }[],
  ): boolean {
    const chain = previous
      ? [{ lat: previous.lat, lng: previous.lng, at: previous.recordedAt }, ...points]
      : points;

    for (let i = 1; i < chain.length; i++) {
      const hours = (chain[i].at.getTime() - chain[i - 1].at.getTime()) / 3600_000;
      if (hours <= 0) continue;

      const speed = haversineKm(chain[i - 1], chain[i]) / hours;
      if (speed > IMPLAUSIBLE_SPEED_KMH) return true;
    }

    return false;
  }

  private toLive(
    order: TrackedOrder,
    point: {
      lat: number;
      lng: number;
      recordedAt: Date;
      speedKmh?: number | null;
      headingDeg?: number | null;
    },
  ): LiveLocation {
    const target = trackingTarget(order.status) ?? 'DELIVERY';
    const targetLat = target === 'PICKUP' ? order.pickupLat : order.deliveryLat;
    const targetLng = target === 'PICKUP' ? order.pickupLng : order.deliveryLng;

    const distanceKm = haversineKm(
      { lat: point.lat, lng: point.lng },
      { lat: targetLat, lng: targetLng },
    );

    const speed = point.speedKmh ?? null;
    // Turgan mashinada (tezlik 0) ETA hisoblanmaydi — "0 km/h da abadiy"
    // degan javob foydasiz. Buning o'rniga o'rtacha tezlikni olamiz.
    const usableSpeed = speed !== null && speed > 5 ? speed : FALLBACK_SPEED_KMH;
    const recordedAt = point.recordedAt;

    return {
      orderId: order.orderId,
      lat: point.lat,
      lng: point.lng,
      speedKmh: speed,
      headingDeg: point.headingDeg ?? null,
      recordedAt,
      target,
      targetLat,
      targetLng,
      distanceToTargetKm: Math.round(distanceKm * 10) / 10,
      etaMinutes: Math.max(1, Math.round((distanceKm / usableSpeed) * 60)),
      status: order.status,
      // 3 daqiqadan eski — haydovchi aloqadan chiqqan (tunnel, batareya)
      isStale: Date.now() - recordedAt.getTime() > 180_000,
    };
  }
}

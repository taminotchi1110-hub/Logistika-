import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { SettingsService } from '@/common/services/settings.service';
import { DatabaseService } from '@/infra/database/database.service';
import { PricingService } from '@/modules/loads/pricing.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { tpl } from '@/modules/notifications/notification-templates';
import { ACTIVE_STATUSES } from '@/modules/orders/order-status';

import {
  DEFAULT_WEIGHTS,
  rankCandidates,
  type DriverCandidate,
  type LoadContext,
  type MatchWeights,
  type RouteMatchKind,
  type ScoredCandidate,
} from './match-score';

/** Bittada nechta nomzod baholanadi — DoS va sekinlashuvdan himoya. */
const MAX_CANDIDATES = 300;

/** Nechta haydovchiga push yuboriladi (D-03 talabi: top-20). */
const NOTIFY_TOP_N = 20;

/**
 * Haydovchi band hisoblanadigan holatlar.
 *
 * `ACTIVE_STATUSES` ga `ASSIGNED` ham qo'shilgan: haydovchi taklifi qabul
 * qilingan, lekin hali tasdiqlamagan bo'lsa ham unga yangi yuk taklif
 * qilmaymiz. `DELIVERED` esa kirmaydi — yuk topshirilgan, haydovchi
 * keyingi reysga tayyor (yuk beruvchining tasdiqlashini kutish faqat
 * to'lov uchun kerak).
 */
const BUSY_ORDER_STATUSES: string[] = ['ASSIGNED', ...ACTIVE_STATUSES];

interface CandidateRow {
  driverId: string;
  vehicleId: string;
  distanceToPickupM: number | null;
  capacityKg: number;
  trailerCapacityKg: number | null;
  volumeM3: string | null;
  ratingAvg: string;
  ratingCount: number;
  completedOrders: number;
  onTimeRate: string;
  responseRate: string;
  cancelRate90d: string;
  isPremium: boolean;
  homeRegionId: number | null;
}

interface RouteRow {
  driverId: string;
  fromRegionId: number;
  toRegionId: number | null;
  isRegular: boolean;
}

export interface MatchView {
  driverId: string;
  vehicleId: string;
  score: number;
  rank: number;
  distanceToPickupKm: number | null;
  reasons: string[];
  driver: {
    firstName: string | null;
    lastName: string | null;
    ratingAvg: number;
    ratingCount: number;
    completedOrders: number;
  };
  vehicle: { brand: string; model: string; plateNumber: string; capacityKg: number };
  notifiedAt: Date | null;
  viewedAt: Date | null;
  offeredAt: Date | null;
}

/**
 * Avtomatik matching.
 *
 * IKKI BOSQICH:
 *   1. HARD FILTER (SQL) — sig'maydigan, tasdiqlanmagan yoki band
 *      haydovchilar umuman qaytmaydi. Bu bazada bajariladi, chunki
 *      minglab yozuvni Node'ga tortib olish ma'nosiz.
 *   2. SOFT SCORING (TypeScript) — qolganlari `match-score.ts` da
 *      baholanadi. U sof funksiya, to'liq unit-test qilingan.
 *
 * NEGA RADIUS BOSQICHMA-BOSQICH: avval 30 km ichida qidiramiz. Yetarli
 * nomzod topilmasa 80 km, keyin 200 km. Shahar ichidagi yukka Xorazmdagi
 * haydovchini taklif qilish — foydasiz push va ishonchni yo'qotish.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly settings: SettingsService,
    private readonly pricing: PricingService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Yuk uchun mos haydovchilarni topadi, `load_matches` ga yozadi va
   * eng yaxshilariga push yuboradi.
   *
   * XATO YUTILADI: matching e'lon qilishning ajralmas qismi emas.
   * U yiqilsa ham yuk lentada ko'rinadi va haydovchi o'zi topadi.
   * Shuning uchun `publish()` matching xatosidan yiqilmasligi kerak.
   */
  async runForLoad(loadId: string): Promise<ScoredCandidate[]> {
    const load = await this.database.db
      .selectFrom('loads')
      .select([
        'id',
        'shipperId',
        'status',
        'weightKg',
        'volumeM3',
        'priceTiyin',
        'distanceKm',
        'pickupRegionId',
        'deliveryRegionId',
        'requiredVehicleTypeIds',
        'requiredBodyTypeIds',
        'pickupTo',
      ])
      .where('id', '=', loadId)
      .executeTakeFirst();

    if (!load) throw AppError.notFound('Yuk topilmadi');

    const radiusSteps = await this.settings.getJson<number[]>(
      'matching.radius_steps_km',
      [30, 80, 200],
    );
    const minScoreForPush = await this.settings.getNumber('matching.min_score_for_push', 45);
    const weights = await this.settings.getJson<MatchWeights>(
      'matching.weights',
      DEFAULT_WEIGHTS,
    );

    // Radiusni bosqichma-bosqich kengaytiramiz
    let rows: CandidateRow[] = [];
    let usedRadiusKm = radiusSteps[radiusSteps.length - 1] ?? 200;

    for (const radiusKm of radiusSteps) {
      rows = await this.findCandidates(load, radiusKm);
      usedRadiusKm = radiusKm;
      if (rows.length >= NOTIFY_TOP_N) break;
    }

    if (rows.length === 0) {
      this.logger.log({ loadId }, 'Mos haydovchi topilmadi');
      return [];
    }

    const routes = await this.loadRoutes(rows.map((row) => row.driverId));
    const suggested = await this.suggestedPrice(load);

    const context: LoadContext = {
      weightKg: load.weightKg,
      volumeM3: load.volumeM3 === null ? null : Number(load.volumeM3),
      priceTiyin: load.priceTiyin === null ? null : Number(load.priceTiyin),
      suggestedPriceTiyin: suggested,
      maxRadiusKm: usedRadiusKm,
    };

    const candidates = rows.map((row) =>
      this.toCandidate(row, routes, load.pickupRegionId, load.deliveryRegionId),
    );
    const ranked = rankCandidates(context, candidates, weights);

    await this.persist(loadId, ranked);
    await this.markMatching(loadId, load.status);

    const toNotify = ranked.filter((item) => item.score >= minScoreForPush).slice(0, NOTIFY_TOP_N);
    await this.notifyDrivers(loadId, toNotify);

    this.logger.log(
      {
        loadId,
        candidates: ranked.length,
        notified: toNotify.length,
        radiusKm: usedRadiusKm,
        topScore: ranked[0]?.score,
      },
      'Matching yakunlandi',
    );

    return ranked;
  }

  /**
   * Yuk uchun topilgan haydovchilar — yuk beruvchi ko'radi.
   *
   * "Kim mening yukimni ko'rdi" savoliga javob beradi va e'lonning
   * yomon sozlanganini ko'rsatadi: agar ro'yxat bo'sh bo'lsa, narx yoki
   * transport talabi haqiqatga mos emas.
   */
  async listForLoad(shipperId: string, loadId: string, limit = 20): Promise<MatchView[]> {
    const owns = await this.database.db
      .selectFrom('loads')
      .select('id')
      .where('id', '=', loadId)
      .where('shipperId', '=', shipperId)
      .executeTakeFirst();

    if (!owns) throw AppError.notFound('Yuk topilmadi');

    const rows = await this.database.db
      .selectFrom('loadMatches as m')
      .innerJoin('users as u', 'u.id', 'm.driverId')
      .leftJoin('vehicles as v', 'v.id', 'm.vehicleId')
      .select([
        'm.driverId',
        'm.vehicleId',
        'm.matchScore',
        'm.rank',
        'm.distanceToPickupKm',
        'm.notifiedAt',
        'm.viewedAt',
        'm.offeredAt',
        'u.firstName',
        'u.lastName',
        'u.ratingAvg',
        'u.ratingCount',
        'u.completedOrders',
        'v.brand',
        'v.model',
        'v.plateNumber',
        'v.capacityKg',
      ])
      .where('m.loadId', '=', loadId)
      .orderBy('m.rank', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      driverId: row.driverId,
      vehicleId: row.vehicleId ?? '',
      score: Number(row.matchScore),
      rank: row.rank,
      distanceToPickupKm:
        row.distanceToPickupKm === null ? null : Number(row.distanceToPickupKm),
      // Sabablar ballar bilan birga saqlanmaydi — ular ko'rsatuv uchun va
      // haydovchiga tegishli. Yuk beruvchiga raqamlar yetarli.
      reasons: [],
      driver: {
        firstName: row.firstName,
        lastName: row.lastName,
        ratingAvg: Number(row.ratingAvg),
        ratingCount: row.ratingCount,
        completedOrders: row.completedOrders,
      },
      vehicle: {
        brand: row.brand ?? '',
        model: row.model ?? '',
        plateNumber: row.plateNumber ?? '',
        capacityKg: row.capacityKg ?? 0,
      },
      notifiedAt: row.notifiedAt,
      viewedAt: row.viewedAt,
      offeredAt: row.offeredAt,
    }));
  }

  /**
   * Haydovchi yukni ochganini belgilaydi.
   *
   * NEGA KERAK: `viewed_at` va `offered_at` — kelajakdagi ML modelning
   * o'quv belgilari (label). "Ko'rdi, lekin taklif yubormadi" — bu ball
   * juda yuqori berilganini bildiradi.
   */
  async markViewed(loadId: string, driverId: string): Promise<void> {
    await this.database.db
      .updateTable('loadMatches')
      .set({ viewedAt: new Date() })
      .where('loadId', '=', loadId)
      .where('driverId', '=', driverId)
      .where('viewedAt', 'is', null)
      .execute();
  }

  /** Haydovchi taklif yuborganini belgilaydi (ML label). */
  async markOffered(loadId: string, driverId: string): Promise<void> {
    await this.database.db
      .updateTable('loadMatches')
      .set({ offeredAt: new Date() })
      .where('loadId', '=', loadId)
      .where('driverId', '=', driverId)
      .where('offeredAt', 'is', null)
      .execute();
  }

  /**
   * HARD FILTER.
   *
   * Bu yerdan qaytgan har bir haydovchi yukni **haqiqatan** tashiy oladi:
   * tasdiqlangan, bo'sh, transporti sig'adi va talab qilingan turga mos.
   * Ballar bu ro'yxatni faqat tartiblaydi — kengaytirmaydi.
   */
  private async findCandidates(
    load: {
      id: string;
      shipperId: string;
      weightKg: number;
      volumeM3: string | null;
      requiredVehicleTypeIds: number[];
      requiredBodyTypeIds: number[];
    },
    radiusKm: number,
  ): Promise<CandidateRow[]> {
    const volume = load.volumeM3 === null ? null : Number(load.volumeM3);

    // DISTINCT ON + ORDER BY quvvat oʻsish tartibida: har bir haydovchidan
    // yukka ETARLI, lekin eng KICHIK transport tanlanadi. 500 kg yukni
    // 20 tonnalik furada tashish ikkala tomon uchun ham zarar.
    const result = await sql<CandidateRow>`
      SELECT DISTINCT ON (dp.user_id)
        dp.user_id                                    AS driver_id,
        v.id                                          AS vehicle_id,
        CASE WHEN dp.current_geom IS NULL THEN NULL
             ELSE ST_Distance(dp.current_geom, l.pickup_geom) END AS distance_to_pickup_m,
        v.capacity_kg,
        v.trailer_capacity_kg,
        v.volume_m3,
        u.rating_avg,
        u.rating_count,
        u.completed_orders,
        dp.on_time_rate,
        dp.response_rate,
        dp.cancel_rate_90d,
        dp.is_premium,
        dp.home_region_id
      FROM driver_profiles dp
      JOIN users u    ON u.id = dp.user_id AND u.status = 'ACTIVE'
      JOIN vehicles v ON v.driver_id = dp.user_id
                     AND v.is_active
                     AND v.verification_status = 'VERIFIED'
      CROSS JOIN (SELECT pickup_geom FROM loads WHERE id = ${load.id}::uuid) l
      WHERE dp.verification_status = 'VERIFIED'
        AND dp.availability = 'AVAILABLE'
        AND dp.user_id <> ${load.shipperId}::uuid
        AND (v.capacity_kg + COALESCE(v.trailer_capacity_kg, 0)) >= ${load.weightKg}
        AND (${volume}::numeric IS NULL OR v.volume_m3 IS NULL OR v.volume_m3 >= ${volume}::numeric)
        AND (cardinality(${load.requiredVehicleTypeIds}::smallint[]) = 0
             OR v.vehicle_type_id = ANY(${load.requiredVehicleTypeIds}::smallint[]))
        AND (cardinality(${load.requiredBodyTypeIds}::smallint[]) = 0
             OR v.body_type_id = ANY(${load.requiredBodyTypeIds}::smallint[]))
        -- Joylashuvi nomaʼlum haydovchi ham qoladi: u yaqinlik boʻyicha past
        -- ball oladi, lekin butunlay tushib qolmaydi
        AND (dp.current_geom IS NULL
             OR ST_DWithin(dp.current_geom, l.pickup_geom, ${radiusKm * 1000}))
        -- Faol buyurtmasi bor haydovchi yangi yukni ololmaydi
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.driver_id = dp.user_id
            AND o.status = ANY(${BUSY_ORDER_STATUSES}::order_status[])
        )
      ORDER BY dp.user_id, (v.capacity_kg + COALESCE(v.trailer_capacity_kg, 0)) ASC
      LIMIT ${MAX_CANDIDATES}
    `.execute(this.database.db);

    return result.rows;
  }

  private toCandidate(
    row: CandidateRow,
    routes: Map<string, RouteRow[]>,
    pickupRegionId: number,
    deliveryRegionId: number,
  ): DriverCandidate {
    return {
      driverId: row.driverId,
      vehicleId: row.vehicleId,
      distanceToPickupKm:
        row.distanceToPickupM === null ? null : Number(row.distanceToPickupM) / 1000,
      routeMatch: matchRoute(
        routes.get(row.driverId) ?? [],
        row.homeRegionId,
        pickupRegionId,
        deliveryRegionId,
      ),
      capacityKg: row.capacityKg + (row.trailerCapacityKg ?? 0),
      volumeM3: row.volumeM3 === null ? null : Number(row.volumeM3),
      ratingAvg: Number(row.ratingAvg),
      ratingCount: row.ratingCount,
      completedOrders: row.completedOrders,
      onTimeRate: Number(row.onTimeRate),
      responseRate: Number(row.responseRate),
      cancelRate90d: Number(row.cancelRate90d),
      isPremium: row.isPremium,
    };
  }

  private async loadRoutes(driverIds: string[]): Promise<Map<string, RouteRow[]>> {
    if (driverIds.length === 0) return new Map();

    const rows = await this.database.db
      .selectFrom('driverRoutes')
      .select(['driverId', 'fromRegionId', 'toRegionId', 'isRegular'])
      .where('driverId', 'in', driverIds)
      .execute();

    const map = new Map<string, RouteRow[]>();
    for (const row of rows) {
      const list = map.get(row.driverId) ?? [];
      list.push(row as RouteRow);
      map.set(row.driverId, list);
    }
    return map;
  }

  private async suggestedPrice(load: {
    pickupRegionId: number;
    deliveryRegionId: number;
    requiredVehicleTypeIds: number[];
    distanceKm: string | null;
    weightKg: number;
  }): Promise<number | null> {
    if (load.distanceKm === null) return null;

    try {
      const suggestion = await this.pricing.suggest({
        fromRegionId: load.pickupRegionId,
        toRegionId: load.deliveryRegionId,
        vehicleTypeIds: load.requiredVehicleTypeIds,
        distanceKm: Number(load.distanceKm),
        weightKg: load.weightKg,
      });
      return suggestion.suggestedPriceTiyin;
    } catch (error) {
      this.logger.warn({ err: error }, 'Tavsiya narxni hisoblab boʻlmadi');
      return null;
    }
  }

  private async persist(loadId: string, ranked: ScoredCandidate[]): Promise<void> {
    if (ranked.length === 0) return;

    // Qayta ishga tushirilganda eski natijalar o'rniga yangisi yoziladi.
    // `notified_at` saqlanadi — bir haydovchiga ikki marta push ketmasin.
    await this.database.db
      .insertInto('loadMatches')
      .values(
        ranked.map((item, index) => ({
          loadId,
          driverId: item.driverId,
          vehicleId: item.vehicleId,
          matchScore: item.score.toFixed(2),
          scoreBreakdown: JSON.stringify(item.components),
          distanceToPickupKm:
            item.distanceToPickupKm === null ? null : item.distanceToPickupKm.toFixed(2),
          weightsVersion: item.weightsVersion,
          rank: index + 1,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['loadId', 'driverId']).doUpdateSet((eb) => ({
          vehicleId: eb.ref('excluded.vehicleId'),
          matchScore: eb.ref('excluded.matchScore'),
          scoreBreakdown: eb.ref('excluded.scoreBreakdown'),
          distanceToPickupKm: eb.ref('excluded.distanceToPickupKm'),
          weightsVersion: eb.ref('excluded.weightsVersion'),
          rank: eb.ref('excluded.rank'),
        })),
      )
      .execute();
  }

  private async markMatching(loadId: string, currentStatus: string): Promise<void> {
    if (currentStatus !== 'PUBLISHED') return;

    await this.database.db
      .updateTable('loads')
      .set({ status: 'MATCHING' })
      .where('id', '=', loadId)
      .where('status', '=', 'PUBLISHED')
      .execute();
  }

  private async notifyDrivers(loadId: string, ranked: ScoredCandidate[]): Promise<void> {
    if (ranked.length === 0) return;

    const load = await this.database.db
      .selectFrom('loads as l')
      .innerJoin('regions as rf', 'rf.id', 'l.pickupRegionId')
      .innerJoin('regions as rt', 'rt.id', 'l.deliveryRegionId')
      // Viloyat nomlari UCHALA tilda: har bir haydovchi o'z tilida oladi
      .select([
        'l.title',
        'l.weightKg',
        'l.priceTiyin',
        'rf.nameUz as fromUz',
        'rf.nameRu as fromRu',
        'rf.nameEn as fromEn',
        'rt.nameUz as toUz',
        'rt.nameRu as toRu',
        'rt.nameEn as toEn',
      ])
      .where('l.id', '=', loadId)
      .executeTakeFirst();

    if (!load) return;

    // Kimga allaqachon xabar berilgan — qayta yubormaymiz
    const alreadyNotified = await this.database.db
      .selectFrom('loadMatches')
      .select('driverId')
      .where('loadId', '=', loadId)
      .where('notifiedAt', 'is not', null)
      .execute();

    const skip = new Set(alreadyNotified.map((row) => row.driverId));
    const targets = ranked.filter((item) => !skip.has(item.driverId));
    if (targets.length === 0) return;

    await Promise.all(
      targets.map((item) =>
        this.notifications.notify({
          userId: item.driverId,
          type: 'load.matched',
          // Har bir haydovchi o'z tilida: viloyat nomi, narx va "mos" so'zi
          template: tpl('load.matched', {
            from: { uz: load.fromUz, ru: load.fromRu, en: load.fromEn },
            to: { uz: load.toUz, ru: load.toRu, en: load.toEn },
            title: load.title,
            weightKg: load.weightKg,
            priceTiyin: load.priceTiyin,
            score: Math.round(item.score),
          }),
          entityType: 'LOAD',
          entityId: loadId,
          deepLink: `karvon://load/${loadId}`,
          data: { loadId, matchScore: item.score, reasons: item.reasons },
          dedupeKey: `match:${loadId}:${item.driverId}`,
        }),
      ),
    );

    await this.database.db
      .updateTable('loadMatches')
      .set({ notifiedAt: new Date() })
      .where('loadId', '=', loadId)
      .where(
        'driverId',
        'in',
        targets.map((item) => item.driverId),
      )
      .execute();
  }
}

/**
 * Haydovchining yo'nalishlari yukka qanchalik mos kelishini aniqlaydi.
 *
 * Eng kuchli moslik qaytariladi: haydovchida bir nechta yo'nalish
 * bo'lishi mumkin va ulardan biri to'liq mos kelsa, shu hisoblanadi.
 */
export function matchRoute(
  routes: RouteRow[],
  homeRegionId: number | null,
  pickupRegionId: number,
  deliveryRegionId: number,
): RouteMatchKind {
  let best: RouteMatchKind = 'NONE';
  const rank: Record<RouteMatchKind, number> = {
    REGULAR_EXACT: 6,
    EXACT: 5,
    FROM_ANY: 4,
    FROM_ONLY: 3,
    TO_ONLY: 2,
    HOME_REGION: 1,
    NONE: 0,
  };

  const consider = (kind: RouteMatchKind): void => {
    if (rank[kind] > rank[best]) best = kind;
  };

  for (const route of routes) {
    const fromMatch = route.fromRegionId === pickupRegionId;
    const toMatch = route.toRegionId === deliveryRegionId;

    if (fromMatch && toMatch) {
      consider(route.isRegular ? 'REGULAR_EXACT' : 'EXACT');
    } else if (fromMatch && route.toRegionId === null) {
      consider('FROM_ANY');
    } else if (fromMatch) {
      consider('FROM_ONLY');
    } else if (toMatch) {
      consider('TO_ONLY');
    }
  }

  if (best === 'NONE' && homeRegionId === pickupRegionId) {
    consider('HOME_REGION');
  }

  return best;
}

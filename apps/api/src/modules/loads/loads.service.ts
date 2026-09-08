import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { sql, type Expression, type SqlBool } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import {
  buildPage,
  decodeCursor,
  type CursorPayload,
  type PageResult,
} from '@/common/utils/cursor.util';
import { maskPhone } from '@/common/utils/phone.util';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';
import type { LoadStatus } from '@/infra/database/database.types';
import { GeoService } from '@/modules/geo/geo.service';
import { RoutingService } from '@/modules/geo/routing.service';

import type { CreateLoadDto, LoadFeedQueryDto, UpdateLoadDto } from './dto/load.dto';
import {
  LOAD_PUBLISHED,
  LOAD_VIEWED,
  LoadPublishedEvent,
  LoadViewedEvent,
} from './load.events';
import { PricingService, type PriceSuggestion } from './pricing.service';

export interface LoadView {
  id: string;
  publicNo: string;
  status: LoadStatus;
  title: string;
  description: string | null;
  categoryId: number;
  categoryName: string | null;
  weightKg: number;
  volumeM3: number | null;
  packagesCount: number | null;
  packageType: string | null;
  isFragile: boolean;
  tempMinC: number | null;
  tempMaxC: number | null;

  pickup: {
    address: string;
    lat: number;
    lng: number;
    regionId: number;
    regionName: string | null;
    districtId: number | null;
    contactName: string | null;
    contactPhone: string | null;
    from: Date;
    to: Date;
  };
  delivery: {
    address: string;
    lat: number;
    lng: number;
    regionId: number;
    regionName: string | null;
    districtId: number | null;
    contactName: string | null;
    contactPhone: string | null;
    by: Date | null;
  };

  distanceKm: number | null;
  durationMin: number | null;
  routePolyline: string | null;

  requiredVehicleTypeIds: number[];
  requiredBodyTypeIds: number[];
  specialRequirementIds: number[];

  priceTiyin: number | null;
  isNegotiable: boolean;
  paymentMethod: string;
  suggestedPriceTiyin: number | null;

  isTop: boolean;
  viewCount: number;
  offerCount: number;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;

  shipper: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    ratingAvg: number;
    ratingCount: number;
    completedOrders: number;
  };

  /** Haydovchidan yuk olish nuqtasigacha (lenta soʻrovida lat/lng berilgan boʻlsa). */
  distanceToPickupKm?: number;

  /**
   * Moslik foizi (0..100) — matching shu haydovchi uchun hisoblagan boʻlsa.
   *
   * Faqat lentada toʻladi. `null` — matching hali bu juftlikni koʻrmagan
   * (masalan eʼlon endi chiqqan yoki haydovchining tasdiqlangan transporti
   * yoʻq); mijoz bunday holatda foizni koʻrsatmasligi kerak.
   */
  matchScore: number | null;
}

/**
 * Soʻrov natijasining shakli.
 *
 * DIQQAT: `CamelCasePlugin` yoqilgani uchun SQL'dagi `pickup_region_name`
 * kabi ustunlar JS'ga `pickupRegionName` boʻlib keladi — SQL alias'lari
 * snake_case boʻlsa ham. Shuning uchun bu yerda camelCase yoziladi.
 */
interface LoadRow {
  id: string;
  publicNo: string;
  status: LoadStatus;
  title: string;
  description: string | null;
  categoryId: number;
  categoryName: string | null;
  weightKg: number;
  volumeM3: string | null;
  packagesCount: number | null;
  packageType: string | null;
  isFragile: boolean;
  tempMinC: number | null;
  tempMaxC: number | null;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  pickupRegionId: number;
  pickupRegionName: string | null;
  pickupDistrictId: number | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupFrom: Date;
  pickupTo: Date;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  deliveryRegionId: number;
  deliveryRegionName: string | null;
  deliveryDistrictId: number | null;
  deliveryContactName: string | null;
  deliveryContactPhone: string | null;
  deliveryBy: Date | null;
  distanceKm: string | null;
  durationMin: number | null;
  routePolyline: string | null;
  requiredVehicleTypeIds: number[];
  requiredBodyTypeIds: number[];
  specialRequirementIds: number[];
  priceTiyin: string | null;
  isNegotiable: boolean;
  paymentMethod: string;
  suggestedPriceTiyin: string | null;
  isTop: boolean;
  viewCount: number;
  offerCount: number;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  shipperId: string;
  shipperFirstName: string | null;
  shipperLastName: string | null;
  shipperRatingAvg: string;
  shipperRatingCount: number;
  shipperCompletedOrders: number;
  distanceToPickupM: number | null;
  /** NUMERIC(5,2) — `pg` uni satr qilib qaytaradi (aniqlik yoʻqolmasligi uchun). */
  matchScore: string | null;
}

/** Haydovchi lentasida koʻrinadigan statuslar. */
const FEED_STATUSES: LoadStatus[] = ['PUBLISHED', 'MATCHING', 'OFFERS_RECEIVED'];
/** Tahrirlash mumkin boʻlgan statuslar. */
const EDITABLE_STATUSES: LoadStatus[] = ['DRAFT', 'PUBLISHED'];

/**
 * Amaldagi TOP bayrogʻi.
 *
 * `is_top` ustuni oʻz-oʻzidan yetarli emas: TOP — pullik va **muddatli**
 * xizmat. Muddati tugagach eʼlon oddiy eʼlonga aylanishi kerak, aks holda
 * bir marta toʻlagan mijoz abadiy tepada qoladi. Shu ifoda ham tartiblashda,
 * ham kursor shartida bir xil ishlatiladi — ikkalasi bir joydan olinmasa,
 * sahifalash jimgina buziladi.
 */
const IS_TOP_NOW = sql<boolean>`(l.is_top AND (l.top_until IS NULL OR l.top_until > now()))`;

@Injectable()
export class LoadsService {
  private readonly logger = new Logger(LoadsService.name);
  private readonly maxActivePerShipper: number;
  private readonly defaultPageSize: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly geo: GeoService,
    private readonly routing: RoutingService,
    private readonly pricing: PricingService,
    private readonly events: EventEmitter2,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.maxActivePerShipper = config.get('LOAD_MAX_ACTIVE_PER_SHIPPER', { infer: true });
    this.defaultPageSize = config.get('LOAD_FEED_PAGE_SIZE', { infer: true });
  }

  // ------------------------------------------------------------- hisoblash

  /** Yuk yaratishdan oldin: masofa, vaqt va narx tavsiyasi. */
  async estimate(input: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    weightKg: number;
    vehicleTypeIds?: number[];
  }): Promise<{
    distanceKm: number;
    durationMin: number;
    routeSource: 'osrm' | 'estimate';
    polyline: string | null;
    price: PriceSuggestion;
    pickupRegion: { id: number; name: string };
    deliveryRegion: { id: number; name: string };
  }> {
    this.geo.assertUsablePoint(input.from, 'Yuk olish nuqtasi');
    this.geo.assertUsablePoint(input.to, 'Yetkazish nuqtasi');

    const [route, pickupRegion, deliveryRegion] = await Promise.all([
      this.routing.route(input.from, input.to),
      this.geo.resolveRegion(input.from),
      this.geo.resolveRegion(input.to),
    ]);

    const price = await this.pricing.suggest({
      fromRegionId: pickupRegion.regionId,
      toRegionId: deliveryRegion.regionId,
      vehicleTypeIds: input.vehicleTypeIds ?? [],
      distanceKm: route.distanceKm,
      weightKg: input.weightKg,
    });

    return {
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      routeSource: route.source,
      polyline: route.polyline,
      price,
      pickupRegion: { id: pickupRegion.regionId, name: pickupRegion.regionNameUz },
      deliveryRegion: { id: deliveryRegion.regionId, name: deliveryRegion.regionNameUz },
    };
  }

  // --------------------------------------------------------------- yaratish

  async create(shipperId: string, dto: CreateLoadDto): Promise<LoadView> {
    this.validateTimeWindow(dto.pickupFrom, dto.pickupTo, dto.deliveryBy);
    this.geo.assertUsablePoint(dto.pickup, 'Yuk olish nuqtasi');
    this.geo.assertUsablePoint(dto.delivery, 'Yetkazish nuqtasi');
    await this.assertUnderActiveLimit(shipperId);
    await this.assertReferencesExist(dto);

    const [route, pickupRegion, deliveryRegion] = await Promise.all([
      this.routing.route(dto.pickup, dto.delivery),
      this.geo.resolveRegion(dto.pickup),
      this.geo.resolveRegion(dto.delivery),
    ]);

    const suggestion = await this.pricing.suggest({
      fromRegionId: pickupRegion.regionId,
      toRegionId: deliveryRegion.regionId,
      vehicleTypeIds: dto.requiredVehicleTypeIds ?? [],
      distanceKm: route.distanceKm,
      weightKg: dto.weightKg,
    });

    // Narx ham, "kelishuv asosida" ham boʻlmasa haydovchi nimaga tayanadi?
    if (!dto.priceTiyin && !dto.isNegotiable) {
      throw AppError.badRequest(
        ErrorCode.LOAD_PRICE_REQUIRED,
        'Narxni koʻrsating yoki "kelishuv asosida" belgisini qoʻying',
      );
    }

    const publishNow = dto.publishNow ?? false;
    const now = new Date();

    const inserted = await sql<{ id: string }>`
      INSERT INTO loads (
        shipper_id, status, title, description, category_id,
        weight_kg, volume_m3, packages_count, package_type, is_fragile,
        temp_min_c, temp_max_c,
        pickup_address, pickup_region_id, pickup_district_id, pickup_geom,
        pickup_contact_name, pickup_contact_phone, pickup_from, pickup_to,
        delivery_address, delivery_region_id, delivery_district_id, delivery_geom,
        delivery_contact_name, delivery_contact_phone, delivery_by,
        distance_km, duration_min, route_polyline,
        required_vehicle_type_ids, required_body_type_ids, special_requirement_ids,
        price_tiyin, is_negotiable, payment_method, suggested_price_tiyin,
        published_at, expires_at
      ) VALUES (
        ${shipperId}, ${publishNow ? 'PUBLISHED' : 'DRAFT'}::load_status,
        ${dto.title.trim()}, ${dto.description?.trim() ?? null}, ${dto.categoryId},
        ${dto.weightKg}, ${dto.volumeM3 ?? null}, ${dto.packagesCount ?? null},
        ${dto.packageType ?? null}, ${dto.isFragile ?? false},
        ${dto.tempMinC ?? null}, ${dto.tempMaxC ?? null},
        ${dto.pickup.address.trim()}, ${pickupRegion.regionId}, ${pickupRegion.districtId},
        ST_SetSRID(ST_MakePoint(${dto.pickup.lng}, ${dto.pickup.lat}), 4326)::geography,
        ${dto.pickup.contactName ?? null}, ${dto.pickup.contactPhone ?? null},
        ${dto.pickupFrom}, ${dto.pickupTo},
        ${dto.delivery.address.trim()}, ${deliveryRegion.regionId}, ${deliveryRegion.districtId},
        ST_SetSRID(ST_MakePoint(${dto.delivery.lng}, ${dto.delivery.lat}), 4326)::geography,
        ${dto.delivery.contactName ?? null}, ${dto.delivery.contactPhone ?? null},
        ${dto.deliveryBy ?? null},
        ${route.distanceKm}, ${route.durationMin}, ${route.polyline},
        ${dto.requiredVehicleTypeIds ?? []}::smallint[],
        ${dto.requiredBodyTypeIds ?? []}::smallint[],
        ${dto.specialRequirementIds ?? []}::smallint[],
        ${dto.priceTiyin ?? null}, ${dto.isNegotiable ?? false},
        ${dto.paymentMethod ?? 'CASH'}::payment_method,
        ${suggestion.suggestedPriceTiyin},
        ${publishNow ? now : null}, ${publishNow ? dto.pickupTo : null}
      )
      RETURNING id
    `.execute(this.database.db);

    const id = inserted.rows[0]?.id;
    if (!id) throw AppError.notFound('Yuk yaratilmadi');

    this.logger.log(
      { loadId: id, shipperId, published: publishNow, routeSource: route.source },
      'Yuk yaratildi',
    );

    // `publishNow` — eng koʻp ishlatiladigan yoʻl (klient odatda qoralama
    // saqlamaydi). Matching hodisasi shu yerda ham chiqarilishi shart,
    // aks holda eʼlonlarning aksariyati matchingsiz qolib ketadi.
    if (publishNow) {
      this.events.emit(LOAD_PUBLISHED, new LoadPublishedEvent(id, shipperId));
    }

    return this.getOwnLoad(shipperId, id);
  }

  async publish(shipperId: string, loadId: string): Promise<LoadView> {
    const load = await this.database.db
      .selectFrom('loads')
      .select(['id', 'status', 'pickupTo', 'priceTiyin', 'isNegotiable'])
      .where('id', '=', loadId)
      .where('shipperId', '=', shipperId)
      .executeTakeFirst();

    if (!load) throw AppError.notFound('Yuk topilmadi');

    if (load.status !== 'DRAFT') {
      throw AppError.conflict(
        ErrorCode.LOAD_NOT_PUBLISHABLE,
        `Faqat qoralamani eʼlon qilish mumkin. Joriy holat: ${load.status}`,
      );
    }
    if (new Date(load.pickupTo).getTime() <= Date.now()) {
      throw AppError.unprocessable(
        ErrorCode.LOAD_PICKUP_TIME_PASSED,
        'Yuklash vaqti oʻtib ketgan. Sanani yangilang.',
      );
    }

    await this.database.db
      .updateTable('loads')
      .set({ status: 'PUBLISHED', publishedAt: new Date(), expiresAt: load.pickupTo })
      .where('id', '=', loadId)
      .execute();

    this.logger.log({ loadId, shipperId }, 'Yuk eʼlon qilindi');

    // Matching hodisa orqali ishga tushadi — javob uni kutib turmaydi
    this.events.emit(LOAD_PUBLISHED, new LoadPublishedEvent(loadId, shipperId));

    return this.getOwnLoad(shipperId, loadId);
  }

  async update(shipperId: string, loadId: string, dto: UpdateLoadDto): Promise<LoadView> {
    const load = await this.database.db
      .selectFrom('loads')
      .select(['id', 'status'])
      .where('id', '=', loadId)
      .where('shipperId', '=', shipperId)
      .executeTakeFirst();

    if (!load) throw AppError.notFound('Yuk topilmadi');

    if (!EDITABLE_STATUSES.includes(load.status)) {
      throw AppError.conflict(
        ErrorCode.LOAD_NOT_EDITABLE,
        `Bu holatdagi yukni tahrirlab boʻlmaydi: ${load.status}`,
      );
    }

    if (dto.pickupFrom && dto.pickupTo) {
      this.validateTimeWindow(dto.pickupFrom, dto.pickupTo, dto.deliveryBy);
    }

    // Marshrutga taʼsir qiluvchi maydonlar oʻzgarsa masofa qayta hisoblanadi
    const routeChanged = Boolean(dto.pickup || dto.delivery);
    let distanceKm: number | undefined;
    let durationMin: number | undefined;
    let polyline: string | null | undefined;

    if (routeChanged) {
      const current = await this.getOwnLoad(shipperId, loadId);
      const from = dto.pickup ?? { lat: current.pickup.lat, lng: current.pickup.lng };
      const to = dto.delivery ?? { lat: current.delivery.lat, lng: current.delivery.lng };

      this.geo.assertUsablePoint(from, 'Yuk olish nuqtasi');
      this.geo.assertUsablePoint(to, 'Yetkazish nuqtasi');

      const route = await this.routing.route(from, to);
      distanceKm = route.distanceKm;
      durationMin = route.durationMin;
      polyline = route.polyline;
    }

    await this.database.db
      .updateTable('loads')
      .set({
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        categoryId: dto.categoryId,
        weightKg: dto.weightKg,
        volumeM3: dto.volumeM3 === undefined ? undefined : String(dto.volumeM3),
        packagesCount: dto.packagesCount,
        packageType: dto.packageType,
        isFragile: dto.isFragile,
        tempMinC: dto.tempMinC,
        tempMaxC: dto.tempMaxC,
        pickupFrom: dto.pickupFrom,
        pickupTo: dto.pickupTo,
        deliveryBy: dto.deliveryBy,
        requiredVehicleTypeIds: dto.requiredVehicleTypeIds,
        requiredBodyTypeIds: dto.requiredBodyTypeIds,
        specialRequirementIds: dto.specialRequirementIds,
        priceTiyin: dto.priceTiyin === undefined ? undefined : String(dto.priceTiyin),
        isNegotiable: dto.isNegotiable,
        paymentMethod: dto.paymentMethod,
        distanceKm: distanceKm === undefined ? undefined : String(distanceKm),
        durationMin,
        routePolyline: polyline,
        expiresAt: dto.pickupTo,
      })
      .where('id', '=', loadId)
      .where('shipperId', '=', shipperId)
      .execute();

    // Koordinata oʻzgargan boʻlsa geo ustunlari alohida yangilanadi (PostGIS)
    if (dto.pickup) {
      const region = await this.geo.resolveRegion(dto.pickup);
      await sql`
        UPDATE loads
        SET pickup_geom = ST_SetSRID(ST_MakePoint(${dto.pickup.lng}, ${dto.pickup.lat}), 4326)::geography,
            pickup_address = ${dto.pickup.address},
            pickup_region_id = ${region.regionId},
            pickup_district_id = ${region.districtId}
        WHERE id = ${loadId} AND shipper_id = ${shipperId}
      `.execute(this.database.db);
    }
    if (dto.delivery) {
      const region = await this.geo.resolveRegion(dto.delivery);
      await sql`
        UPDATE loads
        SET delivery_geom = ST_SetSRID(ST_MakePoint(${dto.delivery.lng}, ${dto.delivery.lat}), 4326)::geography,
            delivery_address = ${dto.delivery.address},
            delivery_region_id = ${region.regionId},
            delivery_district_id = ${region.districtId}
        WHERE id = ${loadId} AND shipper_id = ${shipperId}
      `.execute(this.database.db);
    }

    return this.getOwnLoad(shipperId, loadId);
  }

  async cancel(shipperId: string, loadId: string, reason: string): Promise<LoadView> {
    const load = await this.database.db
      .selectFrom('loads')
      .select(['id', 'status'])
      .where('id', '=', loadId)
      .where('shipperId', '=', shipperId)
      .executeTakeFirst();

    if (!load) throw AppError.notFound('Yuk topilmadi');

    if (load.status === 'ASSIGNED') {
      // Buyurtma tuzilgach bekor qilish jarima siyosatiga tobe —
      // u buyurtma modulida (4-bosqich) hal qilinadi
      throw AppError.conflict(
        ErrorCode.LOAD_HAS_ORDER,
        'Buyurtma tuzilgan. Bekor qilish buyurtma orqali amalga oshiriladi.',
      );
    }
    if (load.status === 'CANCELLED' || load.status === 'EXPIRED') {
      throw AppError.conflict(ErrorCode.LOAD_ALREADY_CLOSED, 'Yuk allaqachon yopilgan');
    }

    await this.database.db
      .updateTable('loads')
      .set({ status: 'CANCELLED' })
      .where('id', '=', loadId)
      .execute();

    // Sabab hozircha faqat logda. 4-bosqichda buyurtma holatlari tarixi
    // (`order_status_history`) qoʻshilganda u yerga ham yoziladi.
    this.logger.log({ loadId, shipperId, reason }, 'Yuk bekor qilindi');
    return this.getOwnLoad(shipperId, loadId);
  }

  // ------------------------------------------------------------------ oʻqish

  async getOwnLoad(shipperId: string, loadId: string): Promise<LoadView> {
    const rows = await this.selectLoads({ loadId, shipperId });
    const row = rows[0];
    if (!row) throw AppError.notFound('Yuk topilmadi');
    return this.toView(row, { revealContacts: true });
  }

  /**
   * Haydovchi uchun yuk tafsiloti.
   *
   * MUHIM: kontakt telefoni **maskalangan** qaytadi. Toʻliq raqam faqat
   * buyurtma tasdiqlangandan keyin ochiladi — bu platformani chetlab
   * oʻtishning oldini oladigan asosiy chora.
   */
  async getPublicLoad(loadId: string, viewerId: string): Promise<LoadView> {
    const rows = await this.selectLoads({ loadId });
    const row = rows[0];
    if (!row) throw AppError.notFound('Yuk topilmadi');

    if (row.shipperId === viewerId) {
      return this.toView(row, { revealContacts: true });
    }
    if (!FEED_STATUSES.includes(row.status)) {
      throw AppError.notFound('Yuk topilmadi');
    }

    // Koʻrishlar soni — eʼlon egasi uchun foydali signal
    await this.database.db
      .updateTable('loads')
      .set((eb) => ({ viewCount: eb('viewCount', '+', 1) }))
      .where('id', '=', loadId)
      .execute();

    // Matching natijasida `viewed_at` belgilanadi (kelajakdagi ML uchun label)
    this.events.emit(LOAD_VIEWED, new LoadViewedEvent(loadId, viewerId));

    return this.toView(row, { revealContacts: false });
  }

  async listMine(shipperId: string, query: LoadFeedQueryDto): Promise<PageResult<LoadView>> {
    const limit = query.limit ?? this.defaultPageSize;
    const rows = await this.selectLoads({ shipperId, query, limit: limit + 1 });

    // Kursor saralash bilan bir xil kalitdan qurilishi shart: ilgari bu
    // yerda doim `created_at` ishlatilardi va mijoz narx boʻyicha
    // saralasa 2-sahifa notoʻgʻri kelardi
    return buildPage(
      rows.map((row) => this.toView(row, { revealContacts: true })),
      limit,
      (view) => this.cursorFor(view, query.sort ?? 'created_at'),
    );
  }

  /**
   * Haydovchi lentasi.
   *
   * Faqat faol eʼlonlar, muddati oʻtmaganlari. `lat`/`lng` berilsa har bir
   * yuk uchun haydovchidan olish nuqtasigacha masofa hisoblanadi va
   * `distance_asc` boʻyicha saralash mumkin boʻladi.
   */
  async feed(driverId: string, query: LoadFeedQueryDto): Promise<PageResult<LoadView>> {
    const limit = query.limit ?? this.defaultPageSize;

    // Lentaning standarti — MOSLIK, sana emas. Haydovchiga eng yangi
    // eʼlon emas, unga eng mos eʼlon kerak: matchingning butun maʼnosi
    // shu. Saralash bir joyda aniqlanadi va soʻrovga yoziladi — aks
    // holda SQL bir tartibda, kursor esa boshqa tartibda qurilib qoladi.
    const sort = query.sort ?? 'match_score';
    const rows = await this.selectLoads({
      query: { ...query, sort },
      limit: limit + 1,
      feedForDriverId: driverId,
    });

    const views = rows.map((row) => this.toView(row, { revealContacts: false }));

    return buildPage(views, limit, (view) => this.cursorFor(view, sort, driverId));
  }

  // ------------------------------------------------------------------ ichki

  private async selectLoads(params: {
    loadId?: string;
    shipperId?: string;
    feedForDriverId?: string;
    query?: LoadFeedQueryDto;
    limit?: number;
  }): Promise<LoadRow[]> {
    const { query } = params;
    const hasDriverPoint = query?.lat !== undefined && query?.lng !== undefined;

    const driverPoint = hasDriverPoint
      ? sql`ST_SetSRID(ST_MakePoint(${query!.lng}, ${query!.lat}), 4326)::geography`
      : null;

    let builder = this.database.db
      .selectFrom('loads as l')
      .innerJoin('users as u', 'u.id', 'l.shipperId')
      .leftJoin('cargoCategories as cc', 'cc.id', 'l.categoryId')
      .leftJoin('regions as pr', 'pr.id', 'l.pickupRegionId')
      .leftJoin('regions as dr', 'dr.id', 'l.deliveryRegionId')
      .select([
        'l.id',
        'l.publicNo as public_no',
        'l.status',
        'l.title',
        'l.description',
        'l.categoryId as category_id',
        'cc.nameUz as category_name',
        'l.weightKg as weight_kg',
        'l.volumeM3 as volume_m3',
        'l.packagesCount as packages_count',
        'l.packageType as package_type',
        'l.isFragile as is_fragile',
        'l.tempMinC as temp_min_c',
        'l.tempMaxC as temp_max_c',
        'l.pickupAddress as pickup_address',
        'l.pickupRegionId as pickup_region_id',
        'pr.nameUz as pickup_region_name',
        'l.pickupDistrictId as pickup_district_id',
        'l.pickupContactName as pickup_contact_name',
        'l.pickupContactPhone as pickup_contact_phone',
        'l.pickupFrom as pickup_from',
        'l.pickupTo as pickup_to',
        'l.deliveryAddress as delivery_address',
        'l.deliveryRegionId as delivery_region_id',
        'dr.nameUz as delivery_region_name',
        'l.deliveryDistrictId as delivery_district_id',
        'l.deliveryContactName as delivery_contact_name',
        'l.deliveryContactPhone as delivery_contact_phone',
        'l.deliveryBy as delivery_by',
        'l.distanceKm as distance_km',
        'l.durationMin as duration_min',
        'l.routePolyline as route_polyline',
        'l.requiredVehicleTypeIds as required_vehicle_type_ids',
        'l.requiredBodyTypeIds as required_body_type_ids',
        'l.specialRequirementIds as special_requirement_ids',
        'l.priceTiyin as price_tiyin',
        'l.isNegotiable as is_negotiable',
        'l.paymentMethod as payment_method',
        'l.suggestedPriceTiyin as suggested_price_tiyin',
        IS_TOP_NOW.as('is_top'),
        'l.viewCount as view_count',
        'l.offerCount as offer_count',
        'l.publishedAt as published_at',
        'l.expiresAt as expires_at',
        'l.createdAt as created_at',
        'l.shipperId as shipper_id',
        'u.firstName as shipper_first_name',
        'u.lastName as shipper_last_name',
        'u.ratingAvg as shipper_rating_avg',
        'u.ratingCount as shipper_rating_count',
        'u.completedOrders as shipper_completed_orders',
        sql<number>`ST_Y(l.pickup_geom::geometry)`.as('pickup_lat'),
        sql<number>`ST_X(l.pickup_geom::geometry)`.as('pickup_lng'),
        sql<number>`ST_Y(l.delivery_geom::geometry)`.as('delivery_lat'),
        sql<number>`ST_X(l.delivery_geom::geometry)`.as('delivery_lng'),
        driverPoint
          ? sql<number>`ST_Distance(l.pickup_geom, ${driverPoint})`.as('distance_to_pickup_m')
          : sql<number | null>`NULL`.as('distance_to_pickup_m'),
        // Moslik foizi — JOIN emas, korrelyatsion pastki soʻrov.
        // `load_matches(load_id, driver_id)` unikal boʻlgani uchun u
        // koʻpi bilan bitta qator qaytaradi va JOIN kabi natijani
        // koʻpaytirib yubormaydi; ustun roʻyxati esa haydovchi bor-yoʻqligiga
        // qarab oʻzgarmaydi (TypeScript uchun ham qulay).
        params.feedForDriverId
          ? this.matchScoreExpr(params.feedForDriverId).as('match_score')
          : sql<string | null>`NULL`.as('match_score'),
      ]);

    if (params.loadId) builder = builder.where('l.id', '=', params.loadId);
    if (params.shipperId) builder = builder.where('l.shipperId', '=', params.shipperId);

    // Lenta: faqat faol va muddati oʻtmagan eʼlonlar, oʻz yuklaridan tashqari
    if (params.feedForDriverId) {
      builder = builder
        .where('l.status', 'in', FEED_STATUSES)
        .where('l.shipperId', '!=', params.feedForDriverId)
        .where((eb) => eb.or([eb('l.expiresAt', 'is', null), eb('l.expiresAt', '>', new Date())]));
    }

    if (query) {
      if (query.fromRegionId) builder = builder.where('l.pickupRegionId', '=', query.fromRegionId);
      if (query.toRegionId) builder = builder.where('l.deliveryRegionId', '=', query.toRegionId);
      if (query.dateFrom) builder = builder.where('l.pickupTo', '>=', new Date(query.dateFrom));
      if (query.dateTo) builder = builder.where('l.pickupFrom', '<=', new Date(query.dateTo));
      if (query.minWeightKg !== undefined) {
        builder = builder.where('l.weightKg', '>=', query.minWeightKg);
      }
      if (query.maxWeightKg !== undefined) {
        builder = builder.where('l.weightKg', '<=', query.maxWeightKg);
      }
      if (query.minPriceTiyin !== undefined) {
        builder = builder.where('l.priceTiyin', '>=', String(query.minPriceTiyin));
      }

      // Massiv kesishishi (&&): "bu turlardan bittasi ham mos kelsa".
      // Boʻsh massiv — "har qanday transport boʻladi", shuning uchun u ham oʻtadi.
      if (query.vehicleTypeIds?.length) {
        builder = builder.where(
          sql<SqlBool>`(cardinality(l.required_vehicle_type_ids) = 0
            OR l.required_vehicle_type_ids && ${query.vehicleTypeIds}::smallint[])`,
        );
      }
      if (query.bodyTypeIds?.length) {
        builder = builder.where(
          sql<SqlBool>`(cardinality(l.required_body_type_ids) = 0
            OR l.required_body_type_ids && ${query.bodyTypeIds}::smallint[])`,
        );
      }

      if (hasDriverPoint && query.maxDistanceKm) {
        builder = builder.where(
          sql<SqlBool>`ST_DWithin(l.pickup_geom, ${driverPoint}, ${query.maxDistanceKm * 1000})`,
        );
      }

      const sort = query.sort ?? 'created_at';

      // Keyset kursor: (top, tartib_qiymati, id) uchligi boʻyicha "keyingisi".
      // Teng qiymatlarda id ajratadi — shuning uchun bir qator ikki marta chiqmaydi.
      if (query.cursor) {
        builder = builder.where(this.cursorCondition(sort, query, params.feedForDriverId));
      }

      // TOP eʼlonlar tepada — pullik xizmat, lekin faqat muddati ichida
      builder = builder.orderBy(sql`${IS_TOP_NOW} desc`);

      switch (sort) {
        case 'match_score':
          // Moslik yoʻq eʼlonlar oxirida: hisoblanmagan foiz 0 dan ham
          // yomonroq signal, uni tepaga chiqarish lentani buzadi.
          builder = builder
            .orderBy(sql`match_score desc nulls last`)
            .orderBy('l.createdAt', 'desc')
            .orderBy('l.id', 'desc');
          break;
        case 'pickup_date':
          builder = builder.orderBy('l.pickupFrom', 'asc').orderBy('l.id', 'asc');
          break;
        case 'price_desc':
          builder = builder.orderBy(sql`coalesce(l.price_tiyin, 0) desc`).orderBy('l.id', 'desc');
          break;
        case 'price_asc':
          builder = builder.orderBy(sql`coalesce(l.price_tiyin, 0) asc`).orderBy('l.id', 'asc');
          break;
        case 'distance_asc':
          builder = builder
            .orderBy(sql`distance_to_pickup_m asc nulls last`)
            .orderBy('l.id', 'asc');
          break;
        default:
          builder = builder.orderBy('l.createdAt', 'desc').orderBy('l.id', 'desc');
      }
    } else {
      builder = builder.orderBy('l.createdAt', 'desc').orderBy('l.id', 'desc');
    }

    if (params.limit) builder = builder.limit(params.limit);

    return (await builder.execute()) as unknown as LoadRow[];
  }

  /**
   * Haydovchi uchun moslik foizi — korrelyatsion pastki soʻrov.
   *
   * Ayni ifoda ustun roʻyxatida ham, kursor shartida ham kerak. Ikki
   * joyga alohida yozilsa, biri oʻzgarganda sahifalash jimgina buziladi —
   * shuning uchun bitta manbadan olinadi.
   */
  private matchScoreExpr(driverId: string) {
    return sql<string | null>`(
      SELECT lm.match_score FROM load_matches lm
       WHERE lm.load_id = l.id AND lm.driver_id = ${driverId}::uuid
    )`;
  }

  /**
   * Kursor sharti — saralash turiga mos keladigan keyset qoidasi.
   *
   * Har bir shart ORDER BY bilan **bir xil** ustunlar va **bir xil**
   * yoʻnalishda boʻlishi shart. Birinchi kalit — hamma joyda TOP bayrogʻi
   * (u ORDER BY da ham birinchi). Kamayish tartibidagi saralashlarda
   * `(top, ...) < (...)`, oʻsish tartibidagilarida esa TOP teskari
   * olinadi — `(NOT top, ...) > (...)` — chunki SQL qator solishtiruvi
   * barcha ustunlar uchun bitta yoʻnalishni talab qiladi.
   */
  private cursorCondition(
    sort: NonNullable<LoadFeedQueryDto['sort']>,
    query: LoadFeedQueryDto,
    driverId?: string,
  ): Expression<SqlBool> {
    const cursor = decodeCursor(query.cursor!);
    const value = cursor.v;
    const top = cursor.t ?? false;

    switch (sort) {
      case 'match_score': {
        // Haydovchisiz (masalan mijozning oʻz roʻyxati) moslik yoʻq —
        // saralash `created_at` ga qaytadi, kursor ham shunga mos boʻlishi kerak.
        // `v2` boʻlmasa kursor boshqa saralashdan kelgan — uni ham
        // `created_at` deb oʻqiymiz, 500 xato qaytarishdan koʻra maʼqul.
        if (!driverId || cursor.v2 === undefined) break;
        return sql<SqlBool>`(${IS_TOP_NOW}, coalesce(${this.matchScoreExpr(driverId)}, -1), l.created_at, l.id)
          < (${top}::boolean, ${value}::numeric, ${cursor.v2}::timestamptz, ${cursor.id}::uuid)`;
      }
      case 'pickup_date':
        return sql<SqlBool>`(NOT ${IS_TOP_NOW}, l.pickup_from, l.id)
          > (NOT ${top}::boolean, ${value}::timestamptz, ${cursor.id}::uuid)`;
      case 'price_desc':
        return sql<SqlBool>`(${IS_TOP_NOW}, coalesce(l.price_tiyin, 0), l.id)
          < (${top}::boolean, ${value}::bigint, ${cursor.id}::uuid)`;
      case 'price_asc':
        return sql<SqlBool>`(NOT ${IS_TOP_NOW}, coalesce(l.price_tiyin, 0), l.id)
          > (NOT ${top}::boolean, ${value}::bigint, ${cursor.id}::uuid)`;
      case 'distance_asc':
        return sql<SqlBool>`(
          NOT ${IS_TOP_NOW},
          ST_Distance(
            l.pickup_geom,
            ST_SetSRID(ST_MakePoint(${query.lng ?? 0}, ${query.lat ?? 0}), 4326)::geography
          ), l.id
        ) > (NOT ${top}::boolean, ${value}::double precision, ${cursor.id}::uuid)`;
      default:
        break;
    }

    return sql<SqlBool>`(${IS_TOP_NOW}, l.created_at, l.id)
      < (${top}::boolean, ${value}::timestamptz, ${cursor.id}::uuid)`;
  }

  /** Oxirgi qator uchun kursor — `cursorCondition` kutayotgan shaklda. */
  private cursorFor(
    view: LoadView,
    sort: NonNullable<LoadFeedQueryDto['sort']>,
    driverId?: string,
  ): CursorPayload {
    const base = { id: view.id, t: view.isTop };

    switch (sort) {
      case 'match_score':
        if (!driverId) break;
        return { ...base, v: view.matchScore ?? -1, v2: view.createdAt.toISOString() };
      case 'pickup_date':
        return { ...base, v: view.pickup.from.toISOString() };
      case 'price_desc':
      case 'price_asc':
        return { ...base, v: view.priceTiyin ?? 0 };
      case 'distance_asc':
        return { ...base, v: Math.round((view.distanceToPickupKm ?? 0) * 1000) };
      default:
        break;
    }

    return { ...base, v: view.createdAt.toISOString() };
  }

  private validateTimeWindow(from: string, to: string, deliveryBy?: string): void {
    const pickupFrom = new Date(from).getTime();
    const pickupTo = new Date(to).getTime();

    if (Number.isNaN(pickupFrom) || Number.isNaN(pickupTo)) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Sana formati notoʻgʻri');
    }
    if (pickupTo < pickupFrom) {
      throw AppError.badRequest(
        ErrorCode.LOAD_TIME_WINDOW_INVALID,
        'Yuklash oynasining tugashi boshlanishidan oldin boʻlishi mumkin emas',
      );
    }
    // 15 daqiqa zaxira: mijoz formani toʻldirayotganda vaqt oʻtib ketishi mumkin
    if (pickupTo < Date.now() - 15 * 60 * 1000) {
      throw AppError.badRequest(ErrorCode.LOAD_PICKUP_TIME_PASSED, 'Yuklash vaqti oʻtib ketgan');
    }
    if (deliveryBy) {
      const by = new Date(deliveryBy).getTime();
      if (Number.isNaN(by) || by < pickupFrom) {
        throw AppError.badRequest(
          ErrorCode.LOAD_TIME_WINDOW_INVALID,
          'Yetkazish muddati yuklash vaqtidan oldin boʻlishi mumkin emas',
        );
      }
    }
  }

  private async assertUnderActiveLimit(shipperId: string): Promise<void> {
    const active = await this.database.db
      .selectFrom('loads')
      .select('id')
      .where('shipperId', '=', shipperId)
      .where('status', 'in', ['DRAFT', 'PUBLISHED', 'MATCHING', 'OFFERS_RECEIVED'] as LoadStatus[])
      .limit(this.maxActivePerShipper)
      .execute();

    if (active.length >= this.maxActivePerShipper) {
      throw AppError.conflict(
        ErrorCode.LOAD_ACTIVE_LIMIT_REACHED,
        `Bir vaqtda ${this.maxActivePerShipper} tadan koʻp faol eʼlon boʻlishi mumkin emas. Eskilarini yoping yoki korporativ tarifga oʻting.`,
      );
    }
  }

  /** Spravochnik ID’lari mavjudligini tekshiradi — mos boʻlmagan filtr matchingni buzadi. */
  private async assertReferencesExist(dto: CreateLoadDto): Promise<void> {
    const category = await this.database.db
      .selectFrom('cargoCategories')
      .select('id')
      .where('id', '=', dto.categoryId)
      .where('isActive', '=', true)
      .executeTakeFirst();

    if (!category) {
      throw AppError.badRequest(ErrorCode.REFERENCE_NOT_FOUND, 'Yuk kategoriyasi topilmadi');
    }

    if (dto.requiredVehicleTypeIds?.length) {
      const found = await this.database.db
        .selectFrom('vehicleTypes')
        .select('id')
        .where('id', 'in', dto.requiredVehicleTypeIds)
        .where('isActive', '=', true)
        .execute();

      if (found.length !== new Set(dto.requiredVehicleTypeIds).size) {
        throw AppError.badRequest(ErrorCode.REFERENCE_NOT_FOUND, 'Transport turi topilmadi');
      }
    }

    if (dto.requiredBodyTypeIds?.length) {
      const found = await this.database.db
        .selectFrom('bodyTypes')
        .select('id')
        .where('id', 'in', dto.requiredBodyTypeIds)
        .where('isActive', '=', true)
        .execute();

      if (found.length !== new Set(dto.requiredBodyTypeIds).size) {
        throw AppError.badRequest(ErrorCode.REFERENCE_NOT_FOUND, 'Kuzov turi topilmadi');
      }
    }
  }

  private toView(row: LoadRow, options: { revealContacts: boolean }): LoadView {
    const hide = (phone: string | null): string | null =>
      phone === null ? null : options.revealContacts ? phone : maskPhone(phone);

    return {
      id: row.id,
      publicNo: String(row.publicNo),
      status: row.status,
      title: row.title,
      description: row.description,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      weightKg: row.weightKg,
      volumeM3: row.volumeM3 === null ? null : Number(row.volumeM3),
      packagesCount: row.packagesCount,
      packageType: row.packageType,
      isFragile: row.isFragile,
      tempMinC: row.tempMinC,
      tempMaxC: row.tempMaxC,

      pickup: {
        address: row.pickupAddress,
        lat: Number(row.pickupLat),
        lng: Number(row.pickupLng),
        regionId: row.pickupRegionId,
        regionName: row.pickupRegionName,
        districtId: row.pickupDistrictId,
        contactName: options.revealContacts ? row.pickupContactName : null,
        contactPhone: hide(row.pickupContactPhone),
        from: row.pickupFrom,
        to: row.pickupTo,
      },
      delivery: {
        address: row.deliveryAddress,
        lat: Number(row.deliveryLat),
        lng: Number(row.deliveryLng),
        regionId: row.deliveryRegionId,
        regionName: row.deliveryRegionName,
        districtId: row.deliveryDistrictId,
        contactName: options.revealContacts ? row.deliveryContactName : null,
        contactPhone: hide(row.deliveryContactPhone),
        by: row.deliveryBy,
      },

      distanceKm: row.distanceKm === null ? null : Number(row.distanceKm),
      durationMin: row.durationMin,
      routePolyline: row.routePolyline,

      requiredVehicleTypeIds: row.requiredVehicleTypeIds ?? [],
      requiredBodyTypeIds: row.requiredBodyTypeIds ?? [],
      specialRequirementIds: row.specialRequirementIds ?? [],

      priceTiyin: row.priceTiyin === null ? null : Number(row.priceTiyin),
      isNegotiable: row.isNegotiable,
      paymentMethod: row.paymentMethod,
      suggestedPriceTiyin:
        row.suggestedPriceTiyin === null ? null : Number(row.suggestedPriceTiyin),

      isTop: row.isTop,
      viewCount: row.viewCount,
      offerCount: row.offerCount,
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,

      shipper: {
        id: row.shipperId,
        firstName: row.shipperFirstName,
        lastName: row.shipperLastName,
        ratingAvg: Number(row.shipperRatingAvg),
        ratingCount: row.shipperRatingCount,
        completedOrders: row.shipperCompletedOrders,
      },

      distanceToPickupKm:
        row.distanceToPickupM === null || row.distanceToPickupM === undefined
          ? undefined
          : Math.round((Number(row.distanceToPickupM) / 1000) * 10) / 10,

      matchScore:
        row.matchScore === null || row.matchScore === undefined ? null : Number(row.matchScore),
    };
  }
}

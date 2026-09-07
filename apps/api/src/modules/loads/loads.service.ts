import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql, type Expression, type SqlBool } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { buildPage, decodeCursor, type PageResult } from '@/common/utils/cursor.util';
import { maskPhone } from '@/common/utils/phone.util';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';
import type { LoadStatus } from '@/infra/database/database.types';
import { GeoService } from '@/modules/geo/geo.service';
import { RoutingService } from '@/modules/geo/routing.service';

import type { CreateLoadDto, LoadFeedQueryDto, UpdateLoadDto } from './dto/load.dto';
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
}

interface LoadRow {
  id: string;
  public_no: string;
  status: LoadStatus;
  title: string;
  description: string | null;
  category_id: number;
  category_name: string | null;
  weight_kg: number;
  volume_m3: string | null;
  packages_count: number | null;
  package_type: string | null;
  is_fragile: boolean;
  temp_min_c: number | null;
  temp_max_c: number | null;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_region_id: number;
  pickup_region_name: string | null;
  pickup_district_id: number | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  pickup_from: Date;
  pickup_to: Date;
  delivery_address: string;
  delivery_lat: number;
  delivery_lng: number;
  delivery_region_id: number;
  delivery_region_name: string | null;
  delivery_district_id: number | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  delivery_by: Date | null;
  distance_km: string | null;
  duration_min: number | null;
  route_polyline: string | null;
  required_vehicle_type_ids: number[];
  required_body_type_ids: number[];
  special_requirement_ids: number[];
  price_tiyin: string | null;
  is_negotiable: boolean;
  payment_method: string;
  suggested_price_tiyin: string | null;
  is_top: boolean;
  view_count: number;
  offer_count: number;
  published_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  shipper_id: string;
  shipper_first_name: string | null;
  shipper_last_name: string | null;
  shipper_rating_avg: string;
  shipper_rating_count: number;
  shipper_completed_orders: number;
  distance_to_pickup_m: number | null;
}

/** Haydovchi lentasida koʻrinadigan statuslar. */
const FEED_STATUSES: LoadStatus[] = ['PUBLISHED', 'MATCHING', 'OFFERS_RECEIVED'];
/** Tahrirlash mumkin boʻlgan statuslar. */
const EDITABLE_STATUSES: LoadStatus[] = ['DRAFT', 'PUBLISHED'];

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
        ErrorCode.VALIDATION_FAILED,
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
        ErrorCode.VALIDATION_FAILED,
        `Faqat qoralamani eʼlon qilish mumkin. Joriy holat: ${load.status}`,
      );
    }
    if (new Date(load.pickupTo).getTime() <= Date.now()) {
      throw AppError.unprocessable(
        ErrorCode.VALIDATION_FAILED,
        'Yuklash vaqti oʻtib ketgan. Sanani yangilang.',
      );
    }

    await this.database.db
      .updateTable('loads')
      .set({ status: 'PUBLISHED', publishedAt: new Date(), expiresAt: load.pickupTo })
      .where('id', '=', loadId)
      .execute();

    this.logger.log({ loadId, shipperId }, 'Yuk eʼlon qilindi');
    // 4-bosqichda shu yerdan matching job navbatga qoʻyiladi
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
        ErrorCode.VALIDATION_FAILED,
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
        ErrorCode.VALIDATION_FAILED,
        'Buyurtma tuzilgan. Bekor qilish buyurtma orqali amalga oshiriladi.',
      );
    }
    if (load.status === 'CANCELLED' || load.status === 'EXPIRED') {
      throw AppError.conflict(ErrorCode.VALIDATION_FAILED, 'Yuk allaqachon yopilgan');
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

    if (row.shipper_id === viewerId) {
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

    return this.toView(row, { revealContacts: false });
  }

  async listMine(shipperId: string, query: LoadFeedQueryDto): Promise<PageResult<LoadView>> {
    const limit = query.limit ?? this.defaultPageSize;
    const rows = await this.selectLoads({ shipperId, query, limit: limit + 1 });

    return buildPage(
      rows.map((row) => this.toView(row, { revealContacts: true })),
      limit,
      (view) => ({ v: view.createdAt.toISOString(), id: view.id }),
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
    const rows = await this.selectLoads({ query, limit: limit + 1, feedForDriverId: driverId });

    const views = rows.map((row) => this.toView(row, { revealContacts: false }));
    const sort = query.sort ?? 'created_at';

    return buildPage(views, limit, (view) => ({
      v: this.cursorValueFor(view, sort),
      id: view.id,
    }));
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
        'l.isTop as is_top',
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

      // Keyset kursor: (tartib_qiymati, id) juftligi boʻyicha "keyingisi".
      // Teng qiymatlarda id ajratadi — shuning uchun bir qator ikki marta chiqmaydi.
      if (query.cursor) {
        builder = builder.where(this.cursorCondition(sort, query));
      }

      // TOP eʼlonlar tepada — pullik xizmat, lekin faqat muddati ichida
      builder = builder.orderBy(
        sql`(l.is_top AND (l.top_until IS NULL OR l.top_until > now())) desc`,
      );

      switch (sort) {
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

  /** Kursor sharti — saralash turiga mos keladigan keyset qoidasi. */
  private cursorCondition(
    sort: NonNullable<LoadFeedQueryDto['sort']>,
    query: LoadFeedQueryDto,
  ): Expression<SqlBool> {
    const cursor = decodeCursor(query.cursor!);
    const value = cursor.v;

    switch (sort) {
      case 'pickup_date':
        return sql<SqlBool>`(l.pickup_from, l.id) > (${value}::timestamptz, ${cursor.id}::uuid)`;
      case 'price_desc':
        return sql<SqlBool>`(coalesce(l.price_tiyin, 0), l.id) < (${value}::bigint, ${cursor.id}::uuid)`;
      case 'price_asc':
        return sql<SqlBool>`(coalesce(l.price_tiyin, 0), l.id) > (${value}::bigint, ${cursor.id}::uuid)`;
      case 'distance_asc':
        return sql<SqlBool>`(
          ST_Distance(
            l.pickup_geom,
            ST_SetSRID(ST_MakePoint(${query.lng ?? 0}, ${query.lat ?? 0}), 4326)::geography
          ), l.id
        ) > (${value}::double precision, ${cursor.id}::uuid)`;
      default:
        return sql<SqlBool>`(l.created_at, l.id) < (${value}::timestamptz, ${cursor.id}::uuid)`;
    }
  }

  private cursorValueFor(
    view: LoadView,
    sort: NonNullable<LoadFeedQueryDto['sort']>,
  ): string | number {
    switch (sort) {
      case 'pickup_date':
        return view.pickup.from.toISOString();
      case 'price_desc':
      case 'price_asc':
        return view.priceTiyin ?? 0;
      case 'distance_asc':
        return Math.round((view.distanceToPickupKm ?? 0) * 1000);
      default:
        return view.createdAt.toISOString();
    }
  }

  private validateTimeWindow(from: string, to: string, deliveryBy?: string): void {
    const pickupFrom = new Date(from).getTime();
    const pickupTo = new Date(to).getTime();

    if (Number.isNaN(pickupFrom) || Number.isNaN(pickupTo)) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Sana formati notoʻgʻri');
    }
    if (pickupTo < pickupFrom) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Yuklash oynasining tugashi boshlanishidan oldin boʻlishi mumkin emas',
      );
    }
    // 15 daqiqa zaxira: mijoz formani toʻldirayotganda vaqt oʻtib ketishi mumkin
    if (pickupTo < Date.now() - 15 * 60 * 1000) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Yuklash vaqti oʻtib ketgan');
    }
    if (deliveryBy) {
      const by = new Date(deliveryBy).getTime();
      if (Number.isNaN(by) || by < pickupFrom) {
        throw AppError.badRequest(
          ErrorCode.VALIDATION_FAILED,
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
        ErrorCode.VALIDATION_FAILED,
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
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Yuk kategoriyasi topilmadi');
    }

    if (dto.requiredVehicleTypeIds?.length) {
      const found = await this.database.db
        .selectFrom('vehicleTypes')
        .select('id')
        .where('id', 'in', dto.requiredVehicleTypeIds)
        .where('isActive', '=', true)
        .execute();

      if (found.length !== new Set(dto.requiredVehicleTypeIds).size) {
        throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Transport turi topilmadi');
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
        throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Kuzov turi topilmadi');
      }
    }
  }

  private toView(row: LoadRow, options: { revealContacts: boolean }): LoadView {
    const hide = (phone: string | null): string | null =>
      phone === null ? null : options.revealContacts ? phone : maskPhone(phone);

    return {
      id: row.id,
      publicNo: String(row.public_no),
      status: row.status,
      title: row.title,
      description: row.description,
      categoryId: row.category_id,
      categoryName: row.category_name,
      weightKg: row.weight_kg,
      volumeM3: row.volume_m3 === null ? null : Number(row.volume_m3),
      packagesCount: row.packages_count,
      packageType: row.package_type,
      isFragile: row.is_fragile,
      tempMinC: row.temp_min_c,
      tempMaxC: row.temp_max_c,

      pickup: {
        address: row.pickup_address,
        lat: Number(row.pickup_lat),
        lng: Number(row.pickup_lng),
        regionId: row.pickup_region_id,
        regionName: row.pickup_region_name,
        districtId: row.pickup_district_id,
        contactName: options.revealContacts ? row.pickup_contact_name : null,
        contactPhone: hide(row.pickup_contact_phone),
        from: row.pickup_from,
        to: row.pickup_to,
      },
      delivery: {
        address: row.delivery_address,
        lat: Number(row.delivery_lat),
        lng: Number(row.delivery_lng),
        regionId: row.delivery_region_id,
        regionName: row.delivery_region_name,
        districtId: row.delivery_district_id,
        contactName: options.revealContacts ? row.delivery_contact_name : null,
        contactPhone: hide(row.delivery_contact_phone),
        by: row.delivery_by,
      },

      distanceKm: row.distance_km === null ? null : Number(row.distance_km),
      durationMin: row.duration_min,
      routePolyline: row.route_polyline,

      requiredVehicleTypeIds: row.required_vehicle_type_ids ?? [],
      requiredBodyTypeIds: row.required_body_type_ids ?? [],
      specialRequirementIds: row.special_requirement_ids ?? [],

      priceTiyin: row.price_tiyin === null ? null : Number(row.price_tiyin),
      isNegotiable: row.is_negotiable,
      paymentMethod: row.payment_method,
      suggestedPriceTiyin:
        row.suggested_price_tiyin === null ? null : Number(row.suggested_price_tiyin),

      isTop: row.is_top,
      viewCount: row.view_count,
      offerCount: row.offer_count,
      publishedAt: row.published_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,

      shipper: {
        id: row.shipper_id,
        firstName: row.shipper_first_name,
        lastName: row.shipper_last_name,
        ratingAvg: Number(row.shipper_rating_avg),
        ratingCount: row.shipper_rating_count,
        completedOrders: row.shipper_completed_orders,
      },

      distanceToPickupKm:
        row.distance_to_pickup_m === null
          ? undefined
          : Math.round((Number(row.distance_to_pickup_m) / 1000) * 10) / 10,
    };
  }
}

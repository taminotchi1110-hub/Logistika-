import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { SettingsService } from '@/common/services/settings.service';
import { DatabaseService } from '@/infra/database/database.service';
import { DriversService } from '@/modules/drivers/drivers.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { VehiclesService } from '@/modules/vehicles/vehicles.service';

export interface OfferView {
  id: string;
  loadId: string;
  driverId: string;
  driverName: string;
  driverRatingAvg: number;
  driverRatingCount: number;
  driverCompletedOrders: number;
  vehicle: { id: string; brand: string; model: string; plateNumber: string; capacityKg: number };
  offeredPriceTiyin: number;
  message: string | null;
  status: string;
  etaToPickupMin: number | null;
  expiresAt: Date;
  createdAt: Date;
}

/** Eʼlon narxidan bu foizdan koʻp chetlangan taklif qabul qilinmaydi. */
const COUNTER_OFFER_TOLERANCE = 0.3;

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly drivers: DriversService,
    private readonly vehicles: VehiclesService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Haydovchi yukka taklif yuboradi.
   *
   * Tekshiruvlar tartibi ataylab shunday: avval eng arzon va eng koʻp
   * uchraydigan rad etish sabablari (verifikatsiya, yuk holati), keyin
   * bazaga yozish. Bu keraksiz yozuvlarni oldini oladi.
   */
  async create(
    driverId: string,
    loadId: string,
    input: { vehicleId: string; offeredPriceTiyin?: number; message?: string },
  ): Promise<OfferView> {
    const readiness = await this.drivers.getReadiness(driverId);
    if (!readiness.canSendOffers) {
      throw AppError.unprocessable(
        ErrorCode.DRIVER_NOT_VERIFIED,
        'Taklif yuborish uchun verifikatsiyani yakunlang',
        { missingSteps: readiness.missingSteps },
      );
    }

    const load = await this.database.db
      .selectFrom('loads')
      .select([
        'id',
        'shipperId',
        'status',
        'priceTiyin',
        'isNegotiable',
        'weightKg',
        'volumeM3',
        'pickupTo',
        'title',
      ])
      .where('id', '=', loadId)
      .executeTakeFirst();

    if (!load) throw AppError.notFound('Yuk topilmadi');
    if (load.shipperId === driverId) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Oʻz yukingizga taklif yubormaysiz');
    }
    if (!['PUBLISHED', 'MATCHING', 'OFFERS_RECEIVED'].includes(load.status)) {
      throw AppError.conflict(ErrorCode.VALIDATION_FAILED, 'Bu yuk endi takliflar qabul qilmaydi');
    }
    if (new Date(load.pickupTo).getTime() <= Date.now()) {
      throw AppError.conflict(ErrorCode.VALIDATION_FAILED, 'Yuklash vaqti oʻtib ketgan');
    }

    const vehicle = await this.vehicles.getOwned(driverId, input.vehicleId);
    if (vehicle.verificationStatus !== 'VERIFIED' || !vehicle.isActive) {
      throw AppError.unprocessable(
        ErrorCode.DRIVER_NOT_VERIFIED,
        'Transport tasdiqlanmagan yoki faol emas',
      );
    }

    // Transport yukni koʻtara oladimi — bu matchingdagi hard filterning aynan oʻzi.
    // Ikki joyda tekshiriladi: lentada koʻrsatmaslik uchun va bu yerda,
    // chunki haydovchi havola orqali toʻgʻridan-toʻgʻri ham kirishi mumkin.
    const totalCapacity = vehicle.capacityKg + (vehicle.trailerCapacityKg ?? 0);
    if (totalCapacity < load.weightKg) {
      throw AppError.unprocessable(
        ErrorCode.VALIDATION_FAILED,
        `Transport quvvati yetarli emas: ${totalCapacity} kg < ${load.weightKg} kg`,
      );
    }

    const listedPrice = load.priceTiyin === null ? null : Number(load.priceTiyin);
    const offeredPrice = input.offeredPriceTiyin ?? listedPrice;

    if (offeredPrice === null || offeredPrice <= 0) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Yuk narxi koʻrsatilmagan — oʻz narxingizni taklif qiling',
      );
    }

    // Demping va spamning oldini olish: eʼlon narxidan ±30% dan koʻp chetlanish
    // qabul qilinmaydi. "Kelishuv asosida" eʼlonlarda cheklov yoʻq.
    if (listedPrice !== null && !load.isNegotiable) {
      const deviation = Math.abs(offeredPrice - listedPrice) / listedPrice;
      if (deviation > COUNTER_OFFER_TOLERANCE) {
        throw AppError.unprocessable(
          ErrorCode.VALIDATION_FAILED,
          `Taklif narxi eʼlon narxidan ${Math.round(COUNTER_OFFER_TOLERANCE * 100)}% dan koʻp farq qila olmaydi`,
          { listedPriceTiyin: listedPrice, offeredPriceTiyin: offeredPrice },
        );
      }
    }

    const ttlMinutes = await this.settings.getNumber('offer.ttl_minutes', 30);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    const inserted = await this.database.db
      .insertInto('orderOffers')
      .values({
        loadId,
        driverId,
        vehicleId: input.vehicleId,
        initiator: 'DRIVER',
        offeredPriceTiyin: String(offeredPrice),
        message: input.message?.trim() ?? null,
        status: 'PENDING',
        expiresAt,
      })
      // Bitta haydovchi bitta yukka bitta faol taklif (partial unique indeks)
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();

    if (!inserted) {
      throw AppError.conflict(
        ErrorCode.VALIDATION_FAILED,
        'Siz bu yukka allaqachon taklif yuborgansiz',
      );
    }

    await this.database.db
      .updateTable('loads')
      .set((eb) => ({ offerCount: eb('offerCount', '+', 1), status: 'OFFERS_RECEIVED' }))
      .where('id', '=', loadId)
      .execute();

    const driver = await this.database.db
      .selectFrom('users')
      .select(['firstName', 'lastName', 'ratingAvg'])
      .where('id', '=', driverId)
      .executeTakeFirst();

    const driverName = [driver?.firstName, driver?.lastName].filter(Boolean).join(' ');
    const priceSoum = Math.round(offeredPrice / 100).toLocaleString('ru-RU');

    await this.notifications.notify({
      userId: load.shipperId,
      type: 'offer.received',
      title: 'Yangi taklif',
      body: `${driverName} · ⭐${Number(driver?.ratingAvg ?? 0).toFixed(1)} · ${priceSoum} soʻm`,
      entityType: 'LOAD',
      entityId: loadId,
      deepLink: `karvon://load/${loadId}/offers`,
      dedupeKey: `offer:${inserted.id}`,
    });

    this.logger.log({ offerId: inserted.id, loadId, driverId }, 'Taklif yuborildi');
    return this.getById(inserted.id);
  }

  /** Yuk egasi uchun takliflar roʻyxati — eng arzoni va reytingi yuqorisi tepada. */
  async listForLoad(shipperId: string, loadId: string): Promise<OfferView[]> {
    const load = await this.database.db
      .selectFrom('loads')
      .select('id')
      .where('id', '=', loadId)
      .where('shipperId', '=', shipperId)
      .executeTakeFirst();

    if (!load) throw AppError.notFound('Yuk topilmadi');

    return this.select({ loadId, statuses: ['PENDING', 'ACCEPTED'] });
  }

  async listMine(driverId: string): Promise<OfferView[]> {
    return this.select({ driverId });
  }

  async getById(offerId: string): Promise<OfferView> {
    const rows = await this.select({ offerId });
    const offer = rows[0];
    if (!offer) throw AppError.notFound('Taklif topilmadi');
    return offer;
  }

  async reject(shipperId: string, offerId: string): Promise<void> {
    const offer = await this.database.db
      .selectFrom('orderOffers as o')
      .innerJoin('loads as l', 'l.id', 'o.loadId')
      .select(['o.id', 'o.driverId', 'o.status', 'l.shipperId', 'l.title'])
      .where('o.id', '=', offerId)
      .executeTakeFirst();

    if (!offer || offer.shipperId !== shipperId) throw AppError.notFound('Taklif topilmadi');
    if (offer.status !== 'PENDING') {
      throw AppError.conflict(ErrorCode.VALIDATION_FAILED, 'Taklif allaqachon koʻrib chiqilgan');
    }

    await this.database.db
      .updateTable('orderOffers')
      .set({ status: 'REJECTED', respondedAt: new Date() })
      .where('id', '=', offerId)
      .execute();

    await this.notifications.notify({
      userId: offer.driverId,
      type: 'offer.rejected',
      title: 'Taklif rad etildi',
      body: offer.title,
      entityType: 'OFFER',
      entityId: offerId,
      dedupeKey: `offer:${offerId}:rejected`,
    });
  }

  async withdraw(driverId: string, offerId: string): Promise<void> {
    const updated = await this.database.db
      .updateTable('orderOffers')
      .set({ status: 'WITHDRAWN', respondedAt: new Date() })
      .where('id', '=', offerId)
      .where('driverId', '=', driverId)
      .where('status', '=', 'PENDING')
      .returning('id')
      .executeTakeFirst();

    if (!updated) {
      throw AppError.notFound('Faol taklif topilmadi');
    }
  }

  /** Muddati oʻtgan takliflarni yopadi — scheduler chaqiradi. */
  async expireOverdue(): Promise<number> {
    const expired = await this.database.db
      .updateTable('orderOffers')
      .set({ status: 'EXPIRED' })
      .where('status', '=', 'PENDING')
      .where('expiresAt', '<', new Date())
      .returning('id')
      .execute();

    if (expired.length > 0) {
      this.logger.log({ count: expired.length }, 'Muddati oʻtgan takliflar yopildi');
    }
    return expired.length;
  }

  private async select(params: {
    offerId?: string;
    loadId?: string;
    driverId?: string;
    statuses?: string[];
  }): Promise<OfferView[]> {
    let query = this.database.db
      .selectFrom('orderOffers as o')
      .innerJoin('users as u', 'u.id', 'o.driverId')
      .innerJoin('vehicles as v', 'v.id', 'o.vehicleId')
      .select([
        'o.id',
        'o.loadId',
        'o.driverId',
        'o.offeredPriceTiyin',
        'o.message',
        'o.status',
        'o.etaToPickupMin',
        'o.expiresAt',
        'o.createdAt',
        'u.firstName',
        'u.lastName',
        'u.ratingAvg',
        'u.ratingCount',
        'u.completedOrders',
        'v.id as vehicleId',
        'v.brand',
        'v.model',
        'v.plateNumber',
        'v.capacityKg',
      ]);

    if (params.offerId) query = query.where('o.id', '=', params.offerId);
    if (params.loadId) query = query.where('o.loadId', '=', params.loadId);
    if (params.driverId) query = query.where('o.driverId', '=', params.driverId);
    if (params.statuses) {
      query = query.where('o.status', 'in', params.statuses as never[]);
    }

    const rows = await query.orderBy('u.ratingAvg', 'desc').orderBy('o.createdAt', 'asc').execute();

    return rows.map((row) => ({
      id: row.id,
      loadId: row.loadId,
      driverId: row.driverId,
      driverName: [row.firstName, row.lastName].filter(Boolean).join(' '),
      driverRatingAvg: Number(row.ratingAvg),
      driverRatingCount: row.ratingCount,
      driverCompletedOrders: row.completedOrders,
      vehicle: {
        id: row.vehicleId,
        brand: row.brand,
        model: row.model,
        plateNumber: row.plateNumber,
        capacityKg: row.capacityKg,
      },
      offeredPriceTiyin: Number(row.offeredPriceTiyin),
      message: row.message,
      status: row.status,
      etaToPickupMin: row.etaToPickupMin,
      expiresAt: new Date(row.expiresAt),
      createdAt: row.createdAt,
    }));
  }
}

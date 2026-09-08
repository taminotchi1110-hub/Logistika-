import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { SettingsService } from '@/common/services/settings.service';
import { maskPhone } from '@/common/utils/phone.util';
import { DatabaseService } from '@/infra/database/database.service';
import type { OrderStatusDb } from '@/infra/database/database.types';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EscrowService } from '@/modules/payments/escrow.service';

import {
  ACTIVE_STATUSES,
  ALLOWED_TRANSITIONS,
  STATUS_LABEL_UZ,
  contactVisibility,
  isTerminal,
  validateTransition,
  type ActorRole,
  type ContactVisibility,
  type OrderStatus,
} from './order-status';
import { ORDER_STATUS_CHANGED, OrderStatusChangedEvent } from './order.events';

export interface OrderView {
  id: string;
  publicNo: string;
  status: OrderStatus;
  statusLabel: string;
  /** Keyingi mumkin boʻlgan holatlar — mobil ilova tugmalarni shundan chizadi. */
  nextAllowed: OrderStatus[];

  priceTiyin: number;
  commissionTiyin: number;
  driverPayoutTiyin: number;
  paymentMethod: string;
  paymentStatus: string;

  load: {
    id: string;
    title: string;
    weightKg: number;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    pickupContactName: string | null;
    pickupContactPhone: string | null;
    deliveryAddress: string;
    deliveryLat: number;
    deliveryLng: number;
    deliveryContactName: string | null;
    deliveryContactPhone: string | null;
    distanceKm: number | null;
    durationMin: number | null;
  };

  counterparty: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    /** Faqat `ARRIVED_AT_PICKUP` dan keyin toʻliq, undan oldin maskalangan. */
    phone: string;
    ratingAvg: number;
    ratingCount: number;
    role: 'SHIPPER' | 'DRIVER';
  };

  vehicle: { id: string; brand: string; model: string; plateNumber: string } | null;

  /** Kontakt va chat qoidalari — ilova shu bayroqlarga qarab UI chizadi. */
  visibility: ContactVisibility;

  conversationId: string | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

interface OrderRow {
  id: string;
  publicNo: string;
  status: OrderStatusDb;
  priceTiyin: string;
  commissionTiyin: string;
  driverPayoutTiyin: string;
  paymentMethod: string;
  paymentStatus: string;
  shipperId: string;
  driverId: string;
  vehicleId: string;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  emergencyRevealedAt: Date | null;

  loadId: string;
  loadTitle: string;
  loadWeightKg: number;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  deliveryContactName: string | null;
  deliveryContactPhone: string | null;
  distanceKm: string | null;
  durationMin: number | null;

  shipperFirstName: string | null;
  shipperLastName: string | null;
  shipperPhone: string;
  shipperRatingAvg: string;
  shipperRatingCount: number;
  driverFirstName: string | null;
  driverLastName: string | null;
  driverPhone: string;
  driverRatingAvg: string;
  driverRatingCount: number;

  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  conversationId: string | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly escrow: EscrowService,
    private readonly events: EventEmitter2,
  ) {}

  // =================================================================
  //  Buyurtma yaratish (taklif qabul qilinganda)
  // =================================================================

  /**
   * Taklifni qabul qiladi va buyurtma yaratadi.
   *
   * BITTA TRANZAKSIYADA: buyurtma yaratiladi, yuk `ASSIGNED` boʻladi,
   * qolgan barcha takliflar rad etiladi va chat ochiladi. Yarim bajarilgan
   * holat boʻlishi mumkin emas — aks holda "yuk band, lekin buyurtma yoʻq"
   * yoki "ikkita haydovchi bitta yukni oldi" holati yuzaga keladi.
   */
  async acceptOffer(shipperId: string, offerId: string): Promise<OrderView> {
    const offer = await this.database.db
      .selectFrom('orderOffers as o')
      .innerJoin('loads as l', 'l.id', 'o.loadId')
      .select([
        'o.id as offerId',
        'o.loadId',
        'o.driverId',
        'o.vehicleId',
        'o.offeredPriceTiyin',
        'o.status as offerStatus',
        'o.expiresAt',
        'l.shipperId',
        'l.status as loadStatus',
        'l.distanceKm',
        'l.durationMin',
        'l.paymentMethod',
      ])
      .where('o.id', '=', offerId)
      .executeTakeFirst();

    if (!offer || offer.shipperId !== shipperId) {
      throw AppError.notFound('Taklif topilmadi');
    }
    if (offer.offerStatus !== 'PENDING') {
      throw AppError.conflict(
        ErrorCode.OFFER_ALREADY_HANDLED,
        `Taklif holati: ${offer.offerStatus}. Faqat kutilayotgan taklifni qabul qilish mumkin.`,
      );
    }
    if (new Date(offer.expiresAt).getTime() <= Date.now()) {
      throw AppError.conflict(ErrorCode.OFFER_EXPIRED, 'Taklif muddati tugagan');
    }
    if (!['PUBLISHED', 'MATCHING', 'OFFERS_RECEIVED'].includes(offer.loadStatus)) {
      throw AppError.conflict(
        ErrorCode.LOAD_NOT_ACCEPTING_OFFERS,
        `Yuk holati: ${offer.loadStatus}. Bu yukka buyurtma tuzib boʻlmaydi.`,
      );
    }

    const distanceKm = offer.distanceKm === null ? null : Number(offer.distanceKm);
    const commissionRate = await this.settings.getCommissionRate(distanceKm);

    const price = BigInt(offer.offeredPriceTiyin);
    // Yaxlitlash pastga: komissiya hech qachon narxdan oshib ketmasin
    const commission = (price * BigInt(Math.round(commissionRate * 10_000))) / 10_000n;
    const payout = price - commission;

    const orderId = await this.database.db.transaction().execute(async (trx) => {
      // Yukni qulflaymiz — ikkita klient bir vaqtda qabul qila olmasin
      const load = await trx
        .selectFrom('loads')
        .select(['id', 'status'])
        .where('id', '=', offer.loadId)
        .forUpdate()
        .executeTakeFirst();

      if (!load || !['PUBLISHED', 'MATCHING', 'OFFERS_RECEIVED'].includes(load.status)) {
        throw AppError.conflict(ErrorCode.LOAD_ALREADY_ASSIGNED, 'Yuk allaqachon band');
      }

      const created = await trx
        .insertInto('orders')
        .values({
          loadId: offer.loadId,
          offerId: offer.offerId,
          shipperId,
          driverId: offer.driverId,
          vehicleId: offer.vehicleId,
          status: 'ASSIGNED',
          priceTiyin: price.toString(),
          commissionRate: commissionRate.toFixed(4),
          commissionTiyin: commission.toString(),
          driverPayoutTiyin: payout.toString(),
          paymentMethod: offer.paymentMethod,
          plannedDistanceKm: offer.distanceKm,
          plannedDurationMin: offer.durationMin,
          trackingToken: this.generateTrackingToken(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('loads')
        .set({ status: 'ASSIGNED' })
        .where('id', '=', offer.loadId)
        .execute();

      await trx
        .updateTable('orderOffers')
        .set({ status: 'ACCEPTED', respondedAt: new Date() })
        .where('id', '=', offer.offerId)
        .execute();

      // Qolgan takliflar avtomatik rad etiladi — haydovchilar kutib qolmasin
      await trx
        .updateTable('orderOffers')
        .set({ status: 'REJECTED', respondedAt: new Date() })
        .where('loadId', '=', offer.loadId)
        .where('id', '!=', offer.offerId)
        .where('status', '=', 'PENDING')
        .execute();

      // CHAT SHU YERDA OCHILADI — telefon raqamlari hali yopiq
      await trx
        .insertInto('conversations')
        .values({
          orderId: created.id,
          loadId: offer.loadId,
          shipperId,
          driverId: offer.driverId,
        })
        .execute();

      await trx
        .insertInto('orderStatusHistory')
        .values({
          orderId: created.id,
          fromStatus: null,
          toStatus: 'ASSIGNED',
          actorId: shipperId,
          actorRole: 'SHIPPER',
          note: 'Taklif qabul qilindi',
        })
        .execute();

      return created.id;
    });

    this.logger.log({ orderId, offerId, shipperId }, 'Buyurtma yaratildi');

    // ESCROW sxemasida pul darhol bloklanadi. Mablagʻ yetmasa buyurtma
    // BEKOR QILINADI: haydovchi behuda yoʻlga chiqmasligi kerak.
    // Naqd sxemada bu qadam oʻtkazib yuboriladi.
    try {
      await this.escrow.hold({
        orderId,
        shipperId,
        priceTiyin: price,
        paymentMethod: offer.paymentMethod,
      });
    } catch (error) {
      await this.rollbackOrder(orderId, offer.loadId, offerId);
      this.logger.warn({ orderId, err: error }, 'Escrow bloklanmadi — buyurtma bekor qilindi');
      throw error;
    }

    await this.notifications.notify({
      userId: offer.driverId,
      type: 'offer.accepted',
      title: 'Taklifingiz qabul qilindi',
      body: 'Buyurtmani tasdiqlang va yoʻlga chiqing. Chat ochildi.',
      entityType: 'ORDER',
      entityId: orderId,
      deepLink: `karvon://order/${orderId}`,
    });

    return this.getForUser(orderId, shipperId);
  }

  /**
   * Escrow bloklanmagan buyurtmani orqaga qaytaradi.
   *
   * Yuk yana `PUBLISHED` boʻladi va taklif `PENDING` ga qaytadi —
   * haydovchi uni qayta yubormasligi kerak, mijoz esa hamyonini
   * toʻldirib yana qabul qila oladi.
   */
  private async rollbackOrder(orderId: string, loadId: string, offerId: string): Promise<void> {
    await this.database.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('orderStatusHistory').where('orderId', '=', orderId).execute();
      await trx.deleteFrom('conversations').where('orderId', '=', orderId).execute();
      await trx.deleteFrom('orders').where('id', '=', orderId).execute();
      await trx
        .updateTable('loads')
        .set({ status: 'OFFERS_RECEIVED' })
        .where('id', '=', loadId)
        .execute();
      await trx
        .updateTable('orderOffers')
        .set({ status: 'PENDING', respondedAt: null })
        .where('id', '=', offerId)
        .execute();
    });
  }

  // =================================================================
  //  Holat oʻzgartirish
  // =================================================================

  /**
   * Buyurtma holatini oʻzgartiradi.
   *
   * Uch qatlamli tekshiruv:
   *   1. Foydalanuvchi shu buyurtmaga aloqadormi (aks holda 404)
   *   2. Oʻtish ruxsat etilganmi (state machine)
   *   3. Aynan shu rol oʻtkaza oladimi
   *
   * `ARRIVED_AT_PICKUP` ga oʻtishda ikkala tomonga "telefon raqamlar ochildi"
   * bildirishnomasi ketadi — bu foydalanuvchi uchun muhim hodisa.
   */
  async changeStatus(
    orderId: string,
    userId: string,
    to: OrderStatus,
    options: { note?: string; lat?: number; lng?: number; actorRole?: ActorRole } = {},
  ): Promise<OrderView> {
    const order = await this.database.db
      .selectFrom('orders')
      .select(['id', 'status', 'shipperId', 'driverId'])
      .where('id', '=', orderId)
      .executeTakeFirst();

    if (!order || (order.shipperId !== userId && order.driverId !== userId)) {
      throw AppError.notFound('Buyurtma topilmadi');
    }

    const actorRole: ActorRole =
      options.actorRole ?? (order.driverId === userId ? 'DRIVER' : 'SHIPPER');
    const from = order.status as OrderStatus;

    const check = validateTransition(from, to, actorRole);
    if (!check.ok) {
      // Ikki xil sabab — ikki xil kod: mobil ilova birinchisida "bu amal
      // hozir mumkin emas", ikkinchisida "buni hamkoringiz bajaradi" deb
      // ko'rsatadi. Bitta umumiy kod bilan ularni ajratib bo'lmasdi.
      const invalid = check.reason === 'INVALID_TRANSITION';
      throw AppError.conflict(
        invalid ? ErrorCode.ORDER_INVALID_TRANSITION : ErrorCode.ORDER_ACTOR_NOT_ALLOWED,
        invalid
          ? `Buyurtma holatini ${from} dan ${to} ga oʻzgartirib boʻlmaydi`
          : `Bu amalni ${actorRole} bajara olmaydi`,
        { from, to, actorRole, reason: check.reason },
      );
    }

    await this.database.db.transaction().execute(async (trx) => {
      const timestamps: Record<string, Date> = {};
      if (to === 'CONFIRMED') timestamps.confirmedAt = new Date();
      if (to === 'EN_ROUTE_TO_PICKUP') timestamps.startedAt = new Date();
      if (to === 'LOADED') timestamps.pickedUpAt = new Date();
      if (to === 'DELIVERED') timestamps.deliveredAt = new Date();
      if (to === 'COMPLETED') timestamps.completedAt = new Date();
      if (to === 'CLOSED') timestamps.closedAt = new Date();

      await trx
        .updateTable('orders')
        .set({ status: to, ...timestamps })
        .where('id', '=', orderId)
        // Optimistik qulf: oradan boshqa so'rov statusni o'zgartirgan bo'lsa
        // bu yangilanish 0 qator ta'sir qiladi va biz eski holatga tayanmaymiz
        .where('status', '=', from)
        .execute();

      await trx
        .insertInto('orderStatusHistory')
        .values({
          orderId,
          fromStatus: from,
          toStatus: to,
          actorId: userId,
          actorRole,
          note: options.note ?? null,
        })
        .execute();

      // Joylashuv berilgan bo'lsa tarixga PostGIS nuqtasi ham yoziladi —
      // nizoda "qayerda turib bosgan" savoliga javob shu
      if (options.lat !== undefined && options.lng !== undefined) {
        await sql`
          UPDATE order_status_history
          SET geom = ST_SetSRID(ST_MakePoint(${options.lng}, ${options.lat}), 4326)::geography
          WHERE id = (SELECT id FROM order_status_history WHERE order_id = ${orderId}
                      ORDER BY created_at DESC LIMIT 1)
        `.execute(trx);
      }

      // Haydovchi bandligi
      if (to === 'CONFIRMED') {
        await trx
          .updateTable('driverProfiles')
          .set({ availability: 'BUSY' })
          .where('userId', '=', order.driverId)
          .execute();
      }
      if (isTerminal(to) || to === 'DELIVERED') {
        await trx
          .updateTable('driverProfiles')
          .set({ availability: 'AVAILABLE' })
          .where('userId', '=', order.driverId)
          .execute();
      }
    });

    this.logger.log({ orderId, from, to, actorRole }, 'Buyurtma holati oʻzgardi');
    await this.announceStatusChange(orderId, order, to);

    // Kuzatuv moduli shu hodisada marshrutni arxivlaydi
    this.events.emit(
      ORDER_STATUS_CHANGED,
      new OrderStatusChangedEvent(orderId, from, to, order.driverId, order.shipperId),
    );

    return this.getForUser(orderId, userId);
  }

  /**
   * Favqulodda kontakt ochish.
   *
   * Haydovchi manzilni topolmasa yoki darvoza yopiq boʻlsa yoʻlda qolmasligi
   * kerak. Shuning uchun raqam muddatidan oldin ochilishi mumkin — lekin
   * SABAB bilan va hodisa yozib qoʻyiladi. Suiisteʼmol qilinsa (bir haydovchi
   * muntazam ishlatsa) anti-fraud buni koʻradi.
   */
  async revealContactsEmergency(
    orderId: string,
    userId: string,
    reason: string,
  ): Promise<OrderView> {
    const order = await this.database.db
      .selectFrom('orders')
      .select(['id', 'status', 'shipperId', 'driverId'])
      .where('id', '=', orderId)
      .executeTakeFirst();

    if (!order || (order.shipperId !== userId && order.driverId !== userId)) {
      throw AppError.notFound('Buyurtma topilmadi');
    }

    const status = order.status as OrderStatus;
    const current = contactVisibility(status);

    if (!current.emergencyRevealAvailable) {
      throw AppError.conflict(
        ErrorCode.ORDER_CONTACTS_ALREADY_VISIBLE,
        current.counterpartyPhone
          ? 'Telefon raqamlari allaqachon ochiq'
          : 'Bu holatda kontakt ochib boʻlmaydi',
      );
    }

    const actorRole: ActorRole = order.driverId === userId ? 'DRIVER' : 'SHIPPER';

    await this.database.db
      .insertInto('orderStatusHistory')
      .values({
        orderId,
        fromStatus: status,
        toStatus: status,
        actorId: userId,
        actorRole,
        note: `FAVQULODDA KONTAKT OCHILDI: ${reason}`,
        meta: { emergencyReveal: true, reason },
      })
      .execute();

    this.logger.warn(
      { orderId, userId, actorRole, reason },
      'Favqulodda kontakt ochildi — audit uchun qayd etildi',
    );

    await this.notifications.notifyBoth(order, () => ({
      type: 'contacts.revealed',
      title: 'Telefon raqamlari ochildi',
      body: `Sabab: ${reason}`,
      entityType: 'ORDER',
      entityId: orderId,
      deepLink: `karvon://order/${orderId}`,
    }));

    return this.getForUser(orderId, userId);
  }

  // =================================================================
  //  Oʻqish
  // =================================================================

  async getForUser(orderId: string, userId: string): Promise<OrderView> {
    const rows = await this.selectOrders({ orderId });
    const row = rows[0];
    if (!row || (row.shipperId !== userId && row.driverId !== userId)) {
      throw AppError.notFound('Buyurtma topilmadi');
    }
    return this.toView(row, userId);
  }

  async listForUser(userId: string, filter: { active?: boolean } = {}): Promise<OrderView[]> {
    const rows = await this.selectOrders({ userId, active: filter.active });
    return rows.map((row) => this.toView(row, userId));
  }

  // =================================================================
  //  Ichki
  // =================================================================

  private async announceStatusChange(
    orderId: string,
    order: { shipperId: string; driverId: string },
    to: OrderStatus,
  ): Promise<void> {
    const label = STATUS_LABEL_UZ[to];

    await this.notifications.notifyBoth(order, (role) => ({
      type: 'order.status',
      title: label,
      body:
        to === 'ARRIVED_AT_PICKUP'
          ? 'Haydovchi yuk olish nuqtasida. Telefon raqamlari endi ochiq.'
          : role === 'SHIPPER'
            ? 'Buyurtmangiz holati oʻzgardi'
            : 'Buyurtma holati yangilandi',
      entityType: 'ORDER',
      entityId: orderId,
      deepLink: `karvon://order/${orderId}`,
      data: { status: to },
      dedupeKey: `order:${orderId}:${to}:${role}`,
    }));
  }

  private async selectOrders(params: {
    orderId?: string;
    userId?: string;
    active?: boolean;
  }): Promise<OrderRow[]> {
    let query = this.database.db
      .selectFrom('orders as o')
      .innerJoin('loads as l', 'l.id', 'o.loadId')
      .innerJoin('users as s', 's.id', 'o.shipperId')
      .innerJoin('users as d', 'd.id', 'o.driverId')
      .leftJoin('vehicles as v', 'v.id', 'o.vehicleId')
      .leftJoin('conversations as c', 'c.orderId', 'o.id')
      .select([
        'o.id',
        'o.publicNo',
        'o.status',
        'o.priceTiyin',
        'o.commissionTiyin',
        'o.driverPayoutTiyin',
        'o.paymentMethod',
        'o.paymentStatus',
        'o.shipperId',
        'o.driverId',
        'o.vehicleId',
        'o.confirmedAt',
        'o.deliveredAt',
        'o.createdAt',
        'l.id as loadId',
        'l.title as loadTitle',
        'l.weightKg as loadWeightKg',
        'l.pickupAddress',
        'l.pickupContactName',
        'l.pickupContactPhone',
        'l.deliveryAddress',
        'l.deliveryContactName',
        'l.deliveryContactPhone',
        'l.distanceKm',
        'l.durationMin',
        's.firstName as shipperFirstName',
        's.lastName as shipperLastName',
        's.phone as shipperPhone',
        's.ratingAvg as shipperRatingAvg',
        's.ratingCount as shipperRatingCount',
        'd.firstName as driverFirstName',
        'd.lastName as driverLastName',
        'd.phone as driverPhone',
        'd.ratingAvg as driverRatingAvg',
        'd.ratingCount as driverRatingCount',
        'v.brand as vehicleBrand',
        'v.model as vehicleModel',
        'v.plateNumber as vehiclePlate',
        'c.id as conversationId',
        sql<number>`ST_Y(l.pickup_geom::geometry)`.as('pickup_lat'),
        sql<number>`ST_X(l.pickup_geom::geometry)`.as('pickup_lng'),
        sql<number>`ST_Y(l.delivery_geom::geometry)`.as('delivery_lat'),
        sql<number>`ST_X(l.delivery_geom::geometry)`.as('delivery_lng'),
        // Favqulodda ochish boʻlganmi — status tarixidan
        sql<Date | null>`(
          SELECT h.created_at FROM order_status_history h
          WHERE h.order_id = o.id AND (h.meta->>'emergencyReveal')::boolean IS TRUE
          ORDER BY h.created_at DESC LIMIT 1
        )`.as('emergency_revealed_at'),
      ]);

    if (params.orderId) query = query.where('o.id', '=', params.orderId);
    if (params.userId) {
      query = query.where((eb) =>
        eb.or([eb('o.shipperId', '=', params.userId!), eb('o.driverId', '=', params.userId!)]),
      );
    }
    if (params.active === true) {
      query = query.where('o.status', 'in', ACTIVE_STATUSES as unknown as OrderStatusDb[]);
    }
    if (params.active === false) {
      query = query.where('o.status', 'not in', ACTIVE_STATUSES as unknown as OrderStatusDb[]);
    }

    return (await query.orderBy('o.createdAt', 'desc').execute()) as unknown as OrderRow[];
  }

  private toView(row: OrderRow, viewerId: string): OrderView {
    const status = row.status as OrderStatus;
    const visibility = contactVisibility(status, {
      emergencyRevealed: row.emergencyRevealedAt !== null,
    });

    const viewerIsDriver = row.driverId === viewerId;
    const counterpartyPhoneRaw = viewerIsDriver ? row.shipperPhone : row.driverPhone;

    const show = (phone: string | null, allowed: boolean): string | null => {
      if (phone === null) return null;
      return allowed ? phone : maskPhone(phone);
    };

    return {
      id: row.id,
      publicNo: String(row.publicNo),
      status,
      statusLabel: STATUS_LABEL_UZ[status],
      nextAllowed: [...ALLOWED_TRANSITIONS[status]],

      priceTiyin: Number(row.priceTiyin),
      commissionTiyin: Number(row.commissionTiyin),
      driverPayoutTiyin: Number(row.driverPayoutTiyin),
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,

      load: {
        id: row.loadId,
        title: row.loadTitle,
        weightKg: row.loadWeightKg,
        pickupAddress: row.pickupAddress,
        pickupLat: Number(row.pickupLat),
        pickupLng: Number(row.pickupLng),
        pickupContactName: visibility.pickupPhone ? row.pickupContactName : null,
        pickupContactPhone: show(row.pickupContactPhone, visibility.pickupPhone),
        deliveryAddress: row.deliveryAddress,
        deliveryLat: Number(row.deliveryLat),
        deliveryLng: Number(row.deliveryLng),
        deliveryContactName: visibility.deliveryPhone ? row.deliveryContactName : null,
        deliveryContactPhone: show(row.deliveryContactPhone, visibility.deliveryPhone),
        distanceKm: row.distanceKm === null ? null : Number(row.distanceKm),
        durationMin: row.durationMin,
      },

      counterparty: {
        id: viewerIsDriver ? row.shipperId : row.driverId,
        firstName: viewerIsDriver ? row.shipperFirstName : row.driverFirstName,
        lastName: viewerIsDriver ? row.shipperLastName : row.driverLastName,
        phone: show(counterpartyPhoneRaw, visibility.counterpartyPhone) ?? '***',
        ratingAvg: Number(viewerIsDriver ? row.shipperRatingAvg : row.driverRatingAvg),
        ratingCount: viewerIsDriver ? row.shipperRatingCount : row.driverRatingCount,
        role: viewerIsDriver ? 'SHIPPER' : 'DRIVER',
      },

      vehicle: row.vehiclePlate
        ? {
            id: row.vehicleId,
            brand: row.vehicleBrand ?? '',
            model: row.vehicleModel ?? '',
            plateNumber: row.vehiclePlate,
          }
        : null,

      visibility,
      conversationId: row.conversationId,
      confirmedAt: row.confirmedAt,
      deliveredAt: row.deliveredAt,
      createdAt: row.createdAt,
    };
  }

  /** Ochiq tracking havolasi uchun token — taxmin qilib boʻlmasligi shart. */
  private generateTrackingToken(): string {
    return randomBytes(16).toString('base64url');
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { SettingsService } from '@/common/services/settings.service';
import { DatabaseService } from '@/infra/database/database.service';
import type { OrderStatusDb, RatingDirection } from '@/infra/database/database.types';
import { NotificationsService } from '@/modules/notifications/notifications.service';

/** Reyting berish mumkin bo'lgan buyurtma holatlari. */
const RATEABLE_STATUSES: OrderStatusDb[] = ['DELIVERED', 'COMPLETED', 'CLOSED'];

/** Baho berish oynasi (kun). Yopilgach ikkala baho ochiladi. */
const DEFAULT_WINDOW_DAYS = 14;

export interface RatingInput {
  score: number;
  punctuality?: number;
  communication?: number;
  cargoCondition?: number;
  reliability?: number;
  comment?: string;
}

export interface RatingView {
  id: string;
  orderId: string;
  score: number;
  punctuality: number | null;
  communication: number | null;
  cargoCondition: number | null;
  reliability: number | null;
  comment: string | null;
  direction: RatingDirection;
  /** Hamkor ham baho berganmi — bermaguncha uning bahosi ko'rinmaydi. */
  isVisible: boolean;
  createdAt: Date;
  rater?: { firstName: string | null; lastName: string | null };
}

/**
 * Ikki tomonlama reyting.
 *
 * KO'R-KO'RONA (double-blind) SXEMA: baholar ikkala tomon ham baho
 * bergunicha YASHIRIN turadi.
 *
 * NEGA: agar haydovchi mijoz qo'ygan 2 ballni ko'rsa, u ham o'ch olish
 * uchun 2 qo'yadi. Natijada reytinglar haqiqiy sifatni emas, o'zaro
 * munosabatni aks ettiradi va tizim ma'nosini yo'qotadi. Bu muammo
 * Uber va Airbnb'da o'lchab isbotlangan — ikkalasi ham shu sxemaga
 * o'tgan.
 *
 * Oyna yopilganda (14 kun) bir tomonlama baho ham ochiladi: aks holda
 * baho bermaslik orqali salbiy fikrni bloklash mumkin bo'lardi.
 */
@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Baho beradi.
   *
   * Bir buyurtmaga bir foydalanuvchi bir marta (`UNIQUE(order_id, rater_id)`).
   * O'zgartirib bo'lmaydi — bu ataylab: baho berilgandan keyin uni
   * "kelishib" o'zgartirish mumkin bo'lmasligi kerak.
   */
  async submit(orderId: string, raterId: string, input: RatingInput): Promise<RatingView> {
    const order = await this.database.db
      .selectFrom('orders')
      .select(['id', 'status', 'shipperId', 'driverId', 'deliveredAt', 'createdAt'])
      .where('id', '=', orderId)
      .executeTakeFirst();

    if (!order || (order.shipperId !== raterId && order.driverId !== raterId)) {
      throw AppError.notFound('Buyurtma topilmadi');
    }

    if (!RATEABLE_STATUSES.includes(order.status as OrderStatusDb)) {
      throw AppError.conflict(
        ErrorCode.RATING_NOT_ALLOWED_YET,
        'Baho faqat yuk topshirilgandan keyin beriladi',
        { status: order.status },
      );
    }

    const windowDays = await this.settings.getNumber('rating.window_days', DEFAULT_WINDOW_DAYS);
    const startedAt = order.deliveredAt ?? order.createdAt;
    const deadline = new Date(startedAt.getTime() + windowDays * 86_400_000);

    if (Date.now() > deadline.getTime()) {
      throw AppError.conflict(
        ErrorCode.RATING_WINDOW_CLOSED,
        `Baho berish muddati tugagan (${windowDays} kun)`,
      );
    }

    const isShipper = order.shipperId === raterId;
    const direction: RatingDirection = isShipper ? 'SHIPPER_TO_DRIVER' : 'DRIVER_TO_SHIPPER';
    const ratedId = isShipper ? order.driverId : order.shipperId;

    // "Yuk holati" faqat mijozdan haydovchiga beriladi — haydovchi
    // o'z yukining holatini baholashi mantiqsiz
    const cargoCondition = isShipper ? (input.cargoCondition ?? null) : null;

    const created = await this.database.db
      .insertInto('ratings')
      .values({
        orderId,
        raterId,
        ratedId,
        direction,
        score: input.score,
        punctuality: input.punctuality ?? null,
        communication: input.communication ?? null,
        cargoCondition,
        reliability: input.reliability ?? null,
        comment: input.comment?.trim() || null,
        isVisible: false,
      })
      .onConflict((oc) => oc.columns(['orderId', 'raterId']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (!created) {
      throw AppError.conflict(
        ErrorCode.RATING_ALREADY_GIVEN,
        'Siz bu buyurtmaga allaqachon baho bergansiz',
      );
    }

    this.logger.log({ orderId, raterId, score: input.score, direction }, 'Baho berildi');

    // Ikkinchi tomon ham bergan bo'lsa — ikkalasini ochamiz
    const revealed = await this.revealIfBothRated(orderId);

    if (!revealed) {
      await this.notifications.notify({
        userId: ratedId,
        type: 'rating.received',
        title: 'Sizga baho berildi',
        body: 'Hamkoringiz baho qoldirdi. Siz ham baho bersangiz, ikkalasi ochiladi.',
        entityType: 'ORDER',
        entityId: orderId,
        deepLink: `karvon://order/${orderId}/rating`,
        dedupeKey: `rating-prompt:${orderId}:${ratedId}`,
      });
    }

    return this.toView(created, false);
  }

  /**
   * Ikkala tomon baho berganmi — bergan bo'lsa ochamiz.
   *
   * Ochilganda foydalanuvchilarning umumiy reytingi qayta hisoblanadi.
   */
  private async revealIfBothRated(orderId: string): Promise<boolean> {
    const rows = await this.database.db
      .selectFrom('ratings')
      .select(['id', 'ratedId', 'raterId'])
      .where('orderId', '=', orderId)
      .execute();

    if (rows.length < 2) return false;

    await this.reveal(orderId);
    return true;
  }

  /** Baholarni ochadi va reytinglarni qayta hisoblaydi. */
  async reveal(orderId: string): Promise<void> {
    const rows = await this.database.db
      .updateTable('ratings')
      .set({ isVisible: true })
      .where('orderId', '=', orderId)
      .where('isVisible', '=', false)
      .returning(['ratedId', 'raterId', 'score'])
      .execute();

    if (rows.length === 0) return;

    for (const row of rows) {
      await this.recalculate(row.ratedId);

      await this.notifications.notify({
        userId: row.ratedId,
        type: 'rating.received',
        title: `Sizga ${row.score} ball berildi`,
        body: 'Baholar ochildi — hamkoringizning fikrini koʻrishingiz mumkin',
        entityType: 'ORDER',
        entityId: orderId,
        deepLink: `karvon://order/${orderId}/rating`,
        dedupeKey: `rating-revealed:${orderId}:${row.ratedId}`,
      });
    }

    this.logger.log({ orderId, count: rows.length }, 'Baholar ochildi');
  }

  /**
   * Muddati o'tgan bir tomonlama baholarni ochadi.
   *
   * NEGA KERAK: hamkor umuman baho bermasa, berilgan baho abadiy
   * yashirin qolardi. Ya'ni yomon xizmat ko'rsatgan tomon shunchaki
   * javob bermaslik orqali salbiy bahoni bloklay olardi.
   *
   * Kunlik cron chaqiradi.
   */
  async revealExpired(): Promise<{ revealed: number }> {
    const windowDays = await this.settings.getNumber('rating.window_days', DEFAULT_WINDOW_DAYS);

    const expired = await sql<{ orderId: string }>`
      SELECT DISTINCT r.order_id AS order_id
        FROM ratings r
        JOIN orders o ON o.id = r.order_id
       WHERE NOT r.is_visible
         AND COALESCE(o.delivered_at, o.created_at) < now() - (${windowDays} || ' days')::interval
    `.execute(this.database.db);

    for (const row of expired.rows) {
      await this.reveal(row.orderId);
    }

    if (expired.rows.length > 0) {
      this.logger.log({ orders: expired.rows.length }, 'Muddati oʻtgan baholar ochildi');
    }

    return { revealed: expired.rows.length };
  }

  /**
   * Foydalanuvchining umumiy reytingini qayta hisoblaydi.
   *
   * NEGA QAYTA HISOB, "o'rtachani yangilash" EMAS: bosqichma-bosqich
   * o'rtacha hisoblashda bitta xato abadiy qolib ketadi. Bu yerda
   * har safar to'liq hisoblanadi — sekinroq, lekin har doim to'g'ri.
   * Reyting kuniga bir necha marta o'zgaradi, tezlik muammo emas.
   */
  private async recalculate(userId: string): Promise<void> {
    const stats = await this.database.db
      .selectFrom('ratings')
      .select((eb) => [
        eb.fn.avg<string>('score').as('avg'),
        eb.fn.count<string>('id').as('count'),
      ])
      .where('ratedId', '=', userId)
      .where('isVisible', '=', true)
      .executeTakeFirst();

    const avg = Number(stats?.avg ?? 0);
    const count = Number(stats?.count ?? 0);

    await this.database.db
      .updateTable('users')
      .set({
        ratingAvg: (Math.round(avg * 100) / 100).toFixed(2),
        ratingCount: count,
      })
      .where('id', '=', userId)
      .execute();

    // Haydovchi bo'lsa — matching uchun ishlatiladigan ko'rsatkichlar
    await this.updateDriverMetrics(userId);
  }

  /**
   * Haydovchining "vaqtida yetkazish" ko'rsatkichi.
   *
   * `punctuality` bahosi 4 va undan yuqori bo'lsa — vaqtida deb
   * hisoblanadi. Bu ko'rsatkich Match Score'da ishlatiladi, ya'ni
   * yaxshi ishlagan haydovchi ko'proq yuk oladi — bu tizimning asosiy
   * rag'batlantirish mexanizmi.
   */
  private async updateDriverMetrics(userId: string): Promise<void> {
    const profile = await this.database.db
      .selectFrom('driverProfiles')
      .select('userId')
      .where('userId', '=', userId)
      .executeTakeFirst();

    if (!profile) return;

    const result = await sql<{ onTimeRate: string | null }>`
      SELECT (COUNT(*) FILTER (WHERE punctuality >= 4))::numeric
             / NULLIF(COUNT(*) FILTER (WHERE punctuality IS NOT NULL), 0) AS on_time_rate
        FROM ratings
       WHERE rated_id = ${userId}::uuid
         AND is_visible
         AND direction = 'SHIPPER_TO_DRIVER'
    `.execute(this.database.db);

    const rate = result.rows[0]?.onTimeRate;
    if (rate === null || rate === undefined) return;

    await this.database.db
      .updateTable('driverProfiles')
      .set({ onTimeRate: Number(rate).toFixed(3) })
      .where('userId', '=', userId)
      .execute();
  }

  /** Foydalanuvchining ochiq baholari — profilda ko'rinadi. */
  async listForUser(userId: string, limit = 20): Promise<RatingView[]> {
    const rows = await this.database.db
      .selectFrom('ratings as r')
      .innerJoin('users as u', 'u.id', 'r.raterId')
      .select([
        'r.id',
        'r.orderId',
        'r.score',
        'r.punctuality',
        'r.communication',
        'r.cargoCondition',
        'r.reliability',
        'r.comment',
        'r.direction',
        'r.isVisible',
        'r.createdAt',
        'u.firstName',
        'u.lastName',
      ])
      .where('r.ratedId', '=', userId)
      .where('r.isVisible', '=', true)
      .orderBy('r.createdAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      ...this.toView(row, true),
      rater: { firstName: row.firstName, lastName: row.lastName },
    }));
  }

  /**
   * Baho kutayotgan buyurtmalar — ilova shu ro'yxatdan eslatma chiqaradi.
   */
  async pending(userId: string): Promise<
    { orderId: string; publicNo: string; counterpartyName: string; deadline: Date }[]
  > {
    const windowDays = await this.settings.getNumber('rating.window_days', DEFAULT_WINDOW_DAYS);

    const rows = await this.database.db
      .selectFrom('orders as o')
      .innerJoin('users as s', 's.id', 'o.shipperId')
      .innerJoin('users as d', 'd.id', 'o.driverId')
      .select([
        'o.id as orderId',
        'o.publicNo',
        'o.shipperId',
        'o.deliveredAt',
        'o.createdAt',
        's.firstName as shipperFirstName',
        's.lastName as shipperLastName',
        'd.firstName as driverFirstName',
        'd.lastName as driverLastName',
      ])
      .where((eb) => eb.or([eb('o.shipperId', '=', userId), eb('o.driverId', '=', userId)]))
      .where('o.status', 'in', RATEABLE_STATUSES)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('ratings')
              .select('id')
              .whereRef('ratings.orderId', '=', 'o.id')
              .where('ratings.raterId', '=', userId),
          ),
        ),
      )
      .orderBy('o.deliveredAt', 'desc')
      .limit(20)
      .execute();

    const now = Date.now();

    return rows
      .map((row) => {
        const startedAt = row.deliveredAt ?? row.createdAt;
        const isShipper = row.shipperId === userId;

        return {
          orderId: row.orderId,
          publicNo: row.publicNo,
          counterpartyName: isShipper
            ? [row.driverFirstName, row.driverLastName].filter(Boolean).join(' ')
            : [row.shipperFirstName, row.shipperLastName].filter(Boolean).join(' '),
          deadline: new Date(startedAt.getTime() + windowDays * 86_400_000),
        };
      })
      .filter((row) => row.deadline.getTime() > now);
  }

  /** Buyurtma bo'yicha baholar — faqat ishtirokchilar uchun. */
  async forOrder(orderId: string, viewerId: string): Promise<RatingView[]> {
    const order = await this.database.db
      .selectFrom('orders')
      .select(['shipperId', 'driverId'])
      .where('id', '=', orderId)
      .executeTakeFirst();

    if (!order || (order.shipperId !== viewerId && order.driverId !== viewerId)) {
      throw AppError.notFound('Buyurtma topilmadi');
    }

    const rows = await this.database.db
      .selectFrom('ratings')
      .selectAll()
      .where('orderId', '=', orderId)
      .execute();

    // O'z bahosini har doim ko'radi; hamkorning bahosi faqat ochilgach
    return rows
      .filter((row) => row.raterId === viewerId || row.isVisible)
      .map((row) => this.toView(row, row.isVisible));
  }

  private toView(
    row: {
      id: string;
      orderId: string;
      score: number;
      punctuality: number | null;
      communication: number | null;
      cargoCondition: number | null;
      reliability: number | null;
      comment: string | null;
      direction: RatingDirection;
      createdAt: Date;
    },
    isVisible: boolean,
  ): RatingView {
    return {
      id: row.id,
      orderId: row.orderId,
      score: row.score,
      punctuality: row.punctuality,
      communication: row.communication,
      cargoCondition: row.cargoCondition,
      reliability: row.reliability,
      comment: row.comment,
      direction: row.direction,
      isVisible,
      createdAt: row.createdAt,
    };
  }
}

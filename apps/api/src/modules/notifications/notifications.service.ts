import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '@/infra/database/database.service';
import { RedisService } from '@/infra/redis/redis.service';
import type { LangCode } from '@/infra/database/database.types';

import { renderTemplate, type NotificationText, type TemplateCall } from './notification-templates';

/**
 * Bildirishnoma kanallari:
 *   IN_APP — bazaga yoziladi, bildirishnomalar markazida ko'rinadi
 *   REALTIME — Redis pub/sub → WebSocket → ilova ochiq bo'lsa ekran
 *              yuqorisidan sirg'aluvchi banner
 *   PUSH — FCM (ilova yopiq yoki fonda bo'lsa) — heads-up bildirishnoma
 */
export type NotificationType =
  | 'offer.received'
  | 'offer.accepted'
  | 'offer.rejected'
  | 'order.assigned'
  | 'order.confirmed'
  | 'order.status'
  | 'order.cancelled'
  | 'chat.message'
  | 'contacts.revealed'
  | 'load.matched'
  | 'payment.received'
  | 'payout.processed'
  | 'rating.received'
  | 'document.reviewed';

interface NotifyBase {
  userId: string;
  type: NotificationType;
  entityType?: 'ORDER' | 'LOAD' | 'OFFER' | 'CONVERSATION' | 'PAYMENT' | 'RATING' | 'DOCUMENT' | 'VEHICLE' | 'USER';
  entityId?: string;
  deepLink?: string;
  data?: Record<string, unknown>;
  /** Bir xil hodisa takrorlanmasin (masalan qayta urinishda). */
  dedupeKey?: string;
  /** Faqat banner kerak, bazaga yozish shart emas (masalan "yozmoqda..."). */
  transient?: boolean;
}

/**
 * Matn ikki xil beriladi — faqat BITTASI (kompilyator tekshiradi):
 *
 *   `template` — asosiy yo'l: matn qabul qiluvchining tilida yig'iladi
 *                (`notification-templates.ts`);
 *   `title` + `body` — tildan mustaqil matn: chatda yuboruvchining ismi
 *                va xabarning o'zi. Uni tarjima qilib bo'lmaydi.
 */
export type NotifyInput = NotifyBase &
  (
    | { template: TemplateCall; title?: undefined; body?: undefined }
    | { template?: undefined; title: string; body: string }
  );

/** `userId` siz — birlashmaning har bir a'zosi alohida (`notifyBoth` uchun). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Qaysi bildirishnoma qaysi Android kanalida ko'rsatiladi. */
const CHANNEL_BY_TYPE: Record<NotificationType, 'karvon_messages' | 'karvon_orders'> = {
  'offer.received': 'karvon_orders',
  'offer.accepted': 'karvon_orders',
  'offer.rejected': 'karvon_orders',
  'order.assigned': 'karvon_orders',
  'order.confirmed': 'karvon_orders',
  'order.status': 'karvon_orders',
  'order.cancelled': 'karvon_orders',
  'chat.message': 'karvon_messages',
  'contacts.revealed': 'karvon_orders',
  // Yangi yuk taklifi — buyurtma kanalida, chunki bu ish taklifi
  'load.matched': 'karvon_orders',
  'payment.received': 'karvon_orders',
  'payout.processed': 'karvon_orders',
  'rating.received': 'karvon_orders',
  'document.reviewed': 'karvon_orders',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Bildirishnoma yuboradi.
   *
   * KANAL TANLASH: agar foydalanuvchi ayni damda ulangan bo'lsa (WebSocket
   * `presence` kaliti bor) — faqat realtime banner. Aks holda — push.
   * Ikkalasi ham yuborilsa foydalanuvchi bitta xabarni ikki marta ko'radi.
   */
  async notify(input: NotifyInput): Promise<void> {
    const dedupeKey =
      input.dedupeKey ??
      createHash('sha256')
        .update(`${input.userId}:${input.type}:${input.entityId ?? ''}`)
        .digest('hex')
        .slice(0, 32);

    // 1. Takrorlanishni Redis'da to'xtatamiz.
    //
    // NEGA BAZADA EMAS: `dedupe_key` indeksi PARTIAL (`WHERE dedupe_key IS NOT NULL`),
    // shuning uchun `ON CONFLICT (dedupe_key)` ishlamaydi — Postgres indeksni
    // aniqlash uchun aynan shu predikatni talab qiladi. Redis'da tekshirish
    // ham arzonroq (muvaffaqiyatsiz INSERT umuman bo'lmaydi), ham aniqroq:
    // takroriy bildirishnoma push ham yubormaydi.
    const isFirst = await this.redis.setIfAbsent(`notif:dedupe:${dedupeKey}`, '1', 600);
    if (!isFirst) {
      this.logger.debug({ dedupeKey, userId: input.userId }, 'Takroriy bildirishnoma o‘tkazildi');
      return;
    }

    // 2. Matn — qabul qiluvchining tilida. Takroriy xabar uchun bazaga
    // murojaat qilinmasligi uchun dedupe'dan KEYIN
    const { title, body } = await this.resolveText(input);

    const payload = {
      type: input.type,
      title,
      body,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      deepLink: input.deepLink ?? null,
      data: input.data ?? {},
      channel: CHANNEL_BY_TYPE[input.type],
      createdAt: new Date().toISOString(),
    };

    // 3. Foydalanuvchi ayni damda ulanganmi — kanal shunga qarab tanlanadi
    const online = await this.isOnline(input.userId);

    // 4. Tarixga yozamiz (bildirishnomalar markazi uchun).
    //
    // `channel` — HAQIQIY yetkazish yo'li, "rejalashtirilgani" emas. Bu
    // ustun keyinchalik hisobot uchun kerak bo'ladi: qancha bildirishnoma
    // push orqali ketdi (FCM xarajati) va qanchasi ilova ochiqligida
    // bannerda ko'rindi. Doim 'IN_APP' yozilsa bu ma'lumot yo'qoladi.
    //
    // `templateKey` — aniq shablon ("document.rejected"), umumiy tur
    // ("document.reviewed") emas: qaysi xabar ko'p ochilishini o'lchash uchun.
    if (!input.transient) {
      try {
        await this.database.db
          .insertInto('notifications')
          .values({
            userId: input.userId,
            templateKey: input.template?.key ?? input.type,
            title,
            body,
            channel: online ? 'IN_APP' : 'PUSH',
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            deepLink: input.deepLink ?? null,
            data: input.data ?? null,
            dedupeKey,
            sentAt: new Date(),
            deliveryStatus: 'SENT',
          })
          .execute();
      } catch (error) {
        // Bildirishnoma yozilmagani asosiy amalni buzmasligi kerak, lekin bu
        // jimgina o'tib ketmasligi ham kerak — shuning uchun ERROR darajasi.
        this.logger.error({ err: error, userId: input.userId }, 'Bildirishnoma yozilmadi');
      }
    }

    // 5. Onlayn bo'lsa — realtime banner, aks holda push.
    //
    // Ikkalasi ham yuborilmaydi: aks holda ilova ochiq turgan foydalanuvchi
    // bitta xabarni ikki marta ko'radi (banner + tizim bildirishnomasi).
    await this.redis.client.publish(
      `notify:user:${input.userId}`,
      JSON.stringify({ ...payload, delivery: online ? 'realtime' : 'push' }),
    );

    if (!online) {
      await this.enqueuePush(input.userId, payload);
    }

    this.logger.log(
      { userId: input.userId, type: input.type, delivery: online ? 'realtime' : 'push' },
      'Bildirishnoma yuborildi',
    );
  }

  /**
   * Ikkala tomonga bir vaqtda (masalan buyurtma statusi o'zgardi).
   *
   * Har bir tomon matnni O'Z TILIDA oladi: shablon har biri uchun alohida
   * yig'iladi — mijoz ruscha, haydovchi o'zbekcha bo'lishi mumkin.
   */
  async notifyBoth(
    users: { shipperId: string; driverId: string },
    build: (role: 'SHIPPER' | 'DRIVER') => DistributiveOmit<NotifyInput, 'userId'>,
  ): Promise<void> {
    await Promise.all([
      this.notify({ userId: users.shipperId, ...build('SHIPPER') } as NotifyInput),
      this.notify({ userId: users.driverId, ...build('DRIVER') } as NotifyInput),
    ]);
  }

  /** WebSocket gateway ulanish/uzilishda chaqiradi. */
  async setOnline(userId: string, socketId: string): Promise<void> {
    await this.redis.client.sadd(`presence:${userId}`, socketId);
    await this.redis.client.expire(`presence:${userId}`, 300);
  }

  async setOffline(userId: string, socketId: string): Promise<void> {
    await this.redis.client.srem(`presence:${userId}`, socketId);
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.redis.client.scard(`presence:${userId}`)) > 0;
  }

  /** Matn: shablon bo'lsa — foydalanuvchi tilida, aks holda tayyor matn. */
  private async resolveText(input: NotifyInput): Promise<NotificationText> {
    if (input.template === undefined) return { title: input.title, body: input.body };
    return renderTemplate(input.template, await this.langOf(input.userId));
  }

  /**
   * Foydalanuvchi tili — mobil ilova uni `PATCH /me` orqali interfeys
   * tiliga moslab turadi. Topilmasa o'zbekcha (platformaning asosiy tili).
   */
  private async langOf(userId: string): Promise<LangCode> {
    const row = await this.database.db
      .selectFrom('users')
      .select('lang')
      .where('id', '=', userId)
      .executeTakeFirst();
    return row?.lang ?? 'uz';
  }

  /**
   * Push navbatga qo'yiladi. FCM integratsiyasi `PushService` da —
   * bu yerda faqat navbat, chunki push yuborish sekin (tashqi HTTP) va
   * asosiy so'rovni kutdirmasligi kerak.
   */
  private async enqueuePush(userId: string, payload: Record<string, unknown>): Promise<void> {
    await this.redis.client.lpush('push:queue', JSON.stringify({ userId, payload }));
    await this.redis.client.ltrim('push:queue', 0, 9999);
  }

  /** Foydalanuvchining bildirishnomalari (markaz uchun). */
  async list(userId: string, limit = 30) {
    return this.database.db
      .selectFrom('notifications')
      .select([
        'id',
        'templateKey',
        'title',
        'body',
        'entityType',
        'entityId',
        'deepLink',
        'isRead',
        'createdAt',
      ])
      .where('userId', '=', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.database.db
      .updateTable('notifications')
      .set({ isRead: true, readAt: new Date() })
      .where('userId', '=', userId)
      .where('isRead', '=', false)
      .execute();
  }

  async unreadCount(userId: string): Promise<number> {
    const row = await this.database.db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('userId', '=', userId)
      .where('isRead', '=', false)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }
}

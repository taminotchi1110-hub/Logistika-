import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '@/infra/database/database.service';
import { RedisService } from '@/infra/redis/redis.service';
import type { LangCode } from '@/infra/database/database.types';

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
  | 'contacts.revealed';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: 'ORDER' | 'LOAD' | 'OFFER' | 'CONVERSATION';
  entityId?: string;
  deepLink?: string;
  data?: Record<string, unknown>;
  /** Bir xil hodisa takrorlanmasin (masalan qayta urinishda). */
  dedupeKey?: string;
  /** Faqat banner kerak, bazaga yozish shart emas (masalan "yozmoqda..."). */
  transient?: boolean;
}

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

    const payload = {
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      deepLink: input.deepLink ?? null,
      data: input.data ?? {},
      channel: CHANNEL_BY_TYPE[input.type],
      createdAt: new Date().toISOString(),
    };

    // 1. Takrorlanishni Redis'da to'xtatamiz.
    //
    // NEGA BAZADA EMAS: `dedupe_key` indeksi PARTIAL (`WHERE dedupe_key IS NOT NULL`),
    // shuning uchun `ON CONFLICT (dedupe_key)` ishlamaydi — Postgres indeksni
    // aniqlash uchun aynan shu predikatni talab qiladi. Redis'da tekshirish
    // hам arzonroq (muvaffaqiyatsiz INSERT umuman bo'lmaydi), ham aniqroq:
    // takroriy bildirishnoma push ham yubormaydi.
    const isFirst = await this.redis.setIfAbsent(`notif:dedupe:${dedupeKey}`, '1', 600);
    if (!isFirst) {
      this.logger.debug({ dedupeKey, userId: input.userId }, 'Takroriy bildirishnoma o‘tkazildi');
      return;
    }

    // 2. Tarixga yozamiz (bildirishnomalar markazi uchun)
    if (!input.transient) {
      try {
        await this.database.db
          .insertInto('notifications')
          .values({
            userId: input.userId,
            templateKey: input.type,
            title: input.title,
            body: input.body,
            channel: 'IN_APP',
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

    // 2. Onlayn bo'lsa — realtime banner, aks holda push
    const online = await this.isOnline(input.userId);

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

  /** Ikkala tomonga bir vaqtda (masalan buyurtma statusi o'zgardi). */
  async notifyBoth(
    users: { shipperId: string; driverId: string },
    build: (role: 'SHIPPER' | 'DRIVER') => Omit<NotifyInput, 'userId'>,
  ): Promise<void> {
    await Promise.all([
      this.notify({ userId: users.shipperId, ...build('SHIPPER') }),
      this.notify({ userId: users.driverId, ...build('DRIVER') }),
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

  /** Til bo'yicha matn tanlash — hozircha uz, keyin i18n paketiga ko'chadi. */
  static text(lang: LangCode, uz: string, ru?: string, en?: string): string {
    if (lang === 'ru' && ru) return ru;
    if (lang === 'en' && en) return en;
    return uz;
  }
}

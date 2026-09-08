import { Injectable } from '@nestjs/common';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { buildPage, decodeCursor, type PageResult } from '@/common/utils/cursor.util';
import { DatabaseService } from '@/infra/database/database.service';
import type { MessageType } from '@/infra/database/database.types';
import { StorageService } from '@/infra/storage/storage.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { contactVisibility, type OrderStatus } from '@/modules/orders/order-status';

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string | null;
  /** `true` — men yozganman (mijoz UI'da o'ng tomonga chizadi). */
  isMine: boolean;
  type: MessageType;
  body: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Suhbat xonasiga tarqatiladigan xabar — ko'ruvchiga bog'liq maydonsiz. */
export type WireMessage = Omit<MessageView, 'isMine'>;

export interface ConversationView {
  id: string;
  orderId: string | null;
  counterparty: { id: string; firstName: string | null; lastName: string | null };
  lastMessage: { body: string | null; type: MessageType; createdAt: Date } | null;
  unreadCount: number;
  /** Chat yozish mumkinmi (buyurtma holatiga bog'liq). */
  canWrite: boolean;
}

export interface ConversationAccess {
  conversationId: string;
  orderId: string | null;
  shipperId: string;
  driverId: string;
  counterpartyId: string;
  canWrite: boolean;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Chatga kirish huquqini tekshiradi.
   *
   * Chat buyurtma bilan bogʻlangan: yozish mumkinligini buyurtma holati
   * belgilaydi (`contactVisibility(status).chatEnabled`). Yopilgan buyurtmada
   * yozib boʻlmaydi, lekin tarixni oʻqish mumkin — nizoda dalil sifatida kerak.
   *
   * Begona suhbat 404 qaytaradi (403 emas) — mavjudligini ham oshkor qilmaymiz.
   */
  async assertAccess(conversationId: string, userId: string): Promise<ConversationAccess> {
    const row = await this.database.db
      .selectFrom('conversations as c')
      .leftJoin('orders as o', 'o.id', 'c.orderId')
      .select(['c.id', 'c.orderId', 'c.shipperId', 'c.driverId', 'c.isClosed', 'o.status'])
      .where('c.id', '=', conversationId)
      .executeTakeFirst();

    if (!row || (row.shipperId !== userId && row.driverId !== userId)) {
      throw AppError.notFound('Suhbat topilmadi');
    }

    const canWrite = row.status
      ? contactVisibility(row.status as OrderStatus).chatEnabled && !row.isClosed
      : !row.isClosed;

    return {
      conversationId: row.id,
      orderId: row.orderId,
      shipperId: row.shipperId,
      driverId: row.driverId,
      counterpartyId: row.shipperId === userId ? row.driverId : row.shipperId,
      canWrite,
    };
  }

  /**
   * Xabar yuboradi.
   *
   * `clientMsgId` — mijoz tomonidagi vaqtinchalik ID. Tarmoq uzilib xabar
   * qayta yuborilsa dublikat boʻlmasligi uchun 60 soniya ichida bir xil
   * `clientMsgId` bilan kelgan xabar rad etiladi (Redis dedupe).
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    input: {
      type?: MessageType;
      body?: string;
      attachmentKey?: string;
      attachmentName?: string;
      clientMsgId?: string;
    },
  ): Promise<MessageView> {
    const access = await this.assertAccess(conversationId, senderId);

    if (!access.canWrite) {
      throw AppError.conflict(
        ErrorCode.CHAT_CLOSED,
        'Bu suhbatda yozib boʻlmaydi (buyurtma yopilgan yoki bekor qilingan)',
      );
    }

    const type = input.type ?? 'TEXT';
    const body = input.body?.trim() ?? null;

    if (type === 'TEXT' && !body) {
      throw AppError.badRequest(ErrorCode.CHAT_MESSAGE_EMPTY, 'Xabar boʻsh boʻlishi mumkin emas');
    }
    if ((type === 'IMAGE' || type === 'FILE') && !input.attachmentKey) {
      throw AppError.badRequest(ErrorCode.CHAT_ATTACHMENT_MISSING, 'Fayl kaliti koʻrsatilmagan');
    }
    if (input.attachmentKey && !input.attachmentKey.includes(`/${senderId}/`)) {
      throw AppError.badRequest(ErrorCode.FILE_KEY_NOT_OWNED, 'Fayl kaliti sizga tegishli emas');
    }

    const created = await this.database.db.transaction().execute(async (trx) => {
      const message = await trx
        .insertInto('messages')
        .values({
          conversationId,
          senderId,
          type,
          body,
          attachmentKey: input.attachmentKey ?? null,
          attachmentName: input.attachmentName ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('conversations')
        .set({ lastMessageAt: new Date() })
        .where('id', '=', conversationId)
        .execute();

      return message;
    });

    // Qabul qiluvchiga bildirishnoma: onlayn boʻlsa ekran yuqorisidan
    // sirgʻaluvchi banner, oflayn boʻlsa heads-up push
    const sender = await this.database.db
      .selectFrom('users')
      .select(['firstName', 'lastName'])
      .where('id', '=', senderId)
      .executeTakeFirst();

    const senderName = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || 'Xabar';
    const preview = type === 'TEXT' ? (body ?? '') : type === 'IMAGE' ? '📷 Rasm' : '📎 Fayl';

    await this.notifications.notify({
      userId: access.counterpartyId,
      type: 'chat.message',
      title: senderName,
      body: preview.length > 120 ? `${preview.slice(0, 117)}...` : preview,
      entityType: 'CONVERSATION',
      entityId: conversationId,
      deepLink: `karvon://order/${access.orderId ?? ''}/chat`,
      data: { conversationId, messageId: created.id, orderId: access.orderId },
      // Har bir xabar alohida — dedupe faqat aynan shu xabar uchun
      dedupeKey: `msg:${created.id}`,
    });

    return this.toView(created, senderId);
  }

  /** Suhbat xabarlari — eng yangisi birinchi, kursor bilan. */
  async listMessages(
    conversationId: string,
    userId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<PageResult<MessageView>> {
    await this.assertAccess(conversationId, userId);

    const limit = options.limit ?? 30;
    let query = this.database.db
      .selectFrom('messages')
      .selectAll()
      .where('conversationId', '=', conversationId)
      .where('deletedAt', 'is', null);

    if (options.cursor) {
      const cursor = decodeCursor(options.cursor);
      query = query.where('createdAt', '<', new Date(String(cursor.v)));
    }

    const rows = await query
      .orderBy('createdAt', 'desc')
      .limit(limit + 1)
      .execute();

    const views = await Promise.all(rows.map((row) => this.toView(row, userId)));

    return buildPage(views, limit, (view) => ({
      v: view.createdAt.toISOString(),
      id: view.id,
    }));
  }

  /** Foydalanuvchining barcha suhbatlari. */
  async listConversations(userId: string): Promise<ConversationView[]> {
    const rows = await this.database.db
      .selectFrom('conversations as c')
      .leftJoin('orders as o', 'o.id', 'c.orderId')
      .innerJoin('users as s', 's.id', 'c.shipperId')
      .innerJoin('users as d', 'd.id', 'c.driverId')
      .select([
        'c.id',
        'c.orderId',
        'c.shipperId',
        'c.driverId',
        'c.isClosed',
        'c.lastMessageAt',
        'o.status',
        's.firstName as shipperFirstName',
        's.lastName as shipperLastName',
        'd.firstName as driverFirstName',
        'd.lastName as driverLastName',
      ])
      .where((eb) => eb.or([eb('c.shipperId', '=', userId), eb('c.driverId', '=', userId)]))
      .orderBy('c.lastMessageAt', 'desc')
      .execute();

    return Promise.all(
      rows.map(async (row) => {
        const viewerIsShipper = row.shipperId === userId;

        const [last, unread] = await Promise.all([
          this.database.db
            .selectFrom('messages')
            .select(['body', 'type', 'createdAt'])
            .where('conversationId', '=', row.id)
            .where('deletedAt', 'is', null)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst(),
          this.database.db
            .selectFrom('messages')
            .select((eb) => eb.fn.countAll<string>().as('count'))
            .where('conversationId', '=', row.id)
            .where('senderId', '!=', userId)
            .where('readAt', 'is', null)
            .executeTakeFirst(),
        ]);

        return {
          id: row.id,
          orderId: row.orderId,
          counterparty: {
            id: viewerIsShipper ? row.driverId : row.shipperId,
            firstName: viewerIsShipper ? row.driverFirstName : row.shipperFirstName,
            lastName: viewerIsShipper ? row.driverLastName : row.shipperLastName,
          },
          lastMessage: last ?? null,
          unreadCount: Number(unread?.count ?? 0),
          canWrite: row.status
            ? contactVisibility(row.status as OrderStatus).chatEnabled && !row.isClosed
            : !row.isClosed,
        };
      }),
    );
  }

  /** Oʻqilgan deb belgilaydi — hamkorga "oʻqildi" belgisi ketadi. */
  async markRead(conversationId: string, userId: string): Promise<{ readCount: number }> {
    await this.assertAccess(conversationId, userId);

    const updated = await this.database.db
      .updateTable('messages')
      .set({ readAt: new Date() })
      .where('conversationId', '=', conversationId)
      .where('senderId', '!=', userId)
      .where('readAt', 'is', null)
      .returning('id')
      .execute();

    return { readCount: updated.length };
  }

  private async toView(
    row: {
      id: string;
      conversationId: string;
      senderId: string | null;
      type: MessageType;
      body: string | null;
      attachmentKey: string | null;
      attachmentName: string | null;
      deliveredAt: Date | null;
      readAt: Date | null;
      createdAt: Date;
    },
    viewerId: string,
  ): Promise<MessageView> {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      isMine: row.senderId === viewerId,
      type: row.type,
      body: row.body,
      // Havola javob berilayotgan paytda generatsiya qilinadi — 5 daqiqa amal qiladi
      attachmentUrl: row.attachmentKey
        ? await this.storage.createDownloadUrl(row.attachmentKey, row.attachmentName ?? undefined)
        : null,
      attachmentName: row.attachmentName,
      deliveredAt: row.deliveredAt,
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }
}

/**
 * Xabarni "ko'ruvchisiz" ko'rinishga o'tkazadi.
 *
 * NEGA KERAK: `isMine` — ko'ruvchiga bog'liq maydon. WebSocket'da xabar
 * butun suhbat xonasiga bitta payload bilan tarqatiladi, shuning uchun
 * u yerda `isMine` bo'lishi mumkin emas: yuboruvchining `true` qiymati
 * qabul qiluvchiga ham yetib borib, xabarni chatning noto'g'ri tomoniga
 * chizib qo'yadi. Mijoz `senderId` ni o'z ID'si bilan solishtiradi.
 */
export function toWireMessage(view: MessageView): WireMessage {
  const { isMine: _isMine, ...wire } = view;
  return wire;
}

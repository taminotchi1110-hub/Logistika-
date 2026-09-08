import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, Socket } from 'socket.io';

import { AppError } from '@/common/errors/app.error';
import { RedisService } from '@/infra/redis/redis.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { TokenService } from '@/modules/auth/token.service';
import { TrackingService } from '@/modules/tracking/tracking.service';
import type { LocationPoint } from '@/modules/tracking/tracking.service';

import { ChatService, toWireMessage } from './chat.service';

interface AuthedSocket extends Socket {
  data: { userId?: string; sessionId?: string };
}

/**
 * Realtime gateway.
 *
 * IKKI VAZIFA:
 *  1. Chat — xabar yuborish/qabul qilish, "oʻqildi", "yozmoqda"
 *  2. Bildirishnoma yetkazish — Redis pub/sub orqali kelgan hodisani
 *     ilova ochiq boʻlgan foydalanuvchiga darhol uzatish (in-app banner)
 *
 * NEGA REDIS ADAPTER: API bir nechta replikada ishlaydi. Foydalanuvchi
 * 1-replikaga ulangan, xabar 2-replikada yaratilgan boʻlishi mumkin.
 * Redis adapter room'larni replikalar oʻrtasida umumlashtiradi.
 */
@WebSocketGateway({
  path: '/ws',
  cors: { origin: true, credentials: true },
  // Mobil tarmoqda WebSocket bloklanishi mumkin — polling zaxira sifatida qoladi
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly tracking: TrackingService,
  ) {}

  async afterInit(server: Server): Promise<void> {
    const pub = this.redis.client.duplicate();
    const sub = this.redis.client.duplicate();
    server.adapter(createAdapter(pub, sub));

    // Bildirishnomalar Redis kanali orqali keladi — ularni tegishli
    // foydalanuvchining room'iga uzatamiz (ilova ochiq boʻlsa banner chiqadi)
    const notifySub = this.redis.client.duplicate();
    await notifySub.psubscribe('notify:user:*');
    notifySub.on('pmessage', (_pattern, channel, message) => {
      const userId = channel.slice('notify:user:'.length);
      try {
        server.to(`user:${userId}`).emit('notification', JSON.parse(message));
      } catch (error) {
        this.logger.warn({ err: error, channel }, 'Bildirishnomani uzatib boʻlmadi');
      }
    });

    // Joylashuv yangilanishlari — buyurtma xonasiga. Shu sxema tufayli
    // `TrackingService` WebSocket haqida umuman bilmaydi va uni keyinchalik
    // alohida servisga koʻchirish mumkin.
    const trackSub = this.redis.client.duplicate();
    await trackSub.psubscribe('track:order:*');
    trackSub.on('pmessage', (_pattern, channel, message) => {
      const orderId = channel.slice('track:order:'.length);
      try {
        server.to(`order:${orderId}`).emit('order:location', JSON.parse(message));
      } catch (error) {
        this.logger.warn({ err: error, channel }, 'Joylashuvni uzatib boʻlmadi');
      }
    });

    this.logger.log('WebSocket gateway tayyor (Redis adapter yoqilgan)');
  }

  /**
   * Ulanish. Token `handshake.auth.token` da kelishi kerak —
   * URL query'da emas, chunki u proxy loglariga tushadi.
   */
  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const raw =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (!raw) throw AppError.unauthorized('Token yuborilmadi');

      const payload = this.tokens.verifyAccessToken(raw);
      const active = await this.tokens.isSessionActive(payload.sid);
      if (!active) throw AppError.unauthorized('Sessiya yopilgan');

      client.data.userId = payload.sub;
      client.data.sessionId = payload.sid;

      await client.join(`user:${payload.sub}`);
      await this.notifications.setOnline(payload.sub, client.id);

      client.emit('connected', { userId: payload.sub });
      this.logger.debug({ userId: payload.sub, socketId: client.id }, 'WS ulandi');
    } catch (error) {
      client.emit('error', {
        code: error instanceof AppError ? error.code : 'AUTH_UNAUTHORIZED',
        message: 'Ulanish rad etildi',
      });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const userId = client.data.userId;
    if (userId) {
      await this.notifications.setOffline(userId, client.id);
      this.logger.debug({ userId, socketId: client.id }, 'WS uzildi');
    }
  }

  @SubscribeMessage('chat:join')
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: boolean; canWrite?: boolean; error?: string }> {
    const userId = this.requireUser(client);
    if (!body?.conversationId) return { ok: false, error: 'conversationId kerak' };

    try {
      const access = await this.chat.assertAccess(body.conversationId, userId);
      await client.join(`conv:${body.conversationId}`);
      return { ok: true, canWrite: access.canWrite };
    } catch (error) {
      return { ok: false, error: error instanceof AppError ? error.code : 'ERROR' };
    }
  }

  @SubscribeMessage('chat:leave')
  async onLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: boolean }> {
    if (body?.conversationId) await client.leave(`conv:${body.conversationId}`);
    return { ok: true };
  }

  /**
   * Xabar yuborish.
   *
   * `clientMsgId` javobda qaytariladi — mijoz oʻzining vaqtinchalik
   * xabarini serverdagi haqiqiy xabar bilan almashtiradi (optimistik UI).
   */
  @SubscribeMessage('chat:message')
  async onMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      conversationId?: string;
      type?: 'TEXT' | 'IMAGE' | 'FILE';
      body?: string;
      attachmentKey?: string;
      attachmentName?: string;
      clientMsgId?: string;
    },
  ): Promise<{ ok: boolean; message?: unknown; clientMsgId?: string; error?: string }> {
    const userId = this.requireUser(client);
    if (!body?.conversationId) return { ok: false, error: 'conversationId kerak' };

    try {
      const message = await this.chat.sendMessage(body.conversationId, userId, {
        type: body.type,
        body: body.body,
        attachmentKey: body.attachmentKey,
        attachmentName: body.attachmentName,
        clientMsgId: body.clientMsgId,
      });

      // Suhbatdagi barchaga (jumladan yuboruvchining boshqa qurilmalariga).
      // `isMine` olib tashlanadi — u har bir mijozda `senderId` bo'yicha hisoblanadi.
      this.server.to(`conv:${body.conversationId}`).emit('chat:message', toWireMessage(message));

      return { ok: true, message, clientMsgId: body.clientMsgId };
    } catch (error) {
      return {
        ok: false,
        clientMsgId: body.clientMsgId,
        error: error instanceof AppError ? error.code : 'ERROR',
      };
    }
  }

  @SubscribeMessage('chat:read')
  async onRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: boolean; readCount?: number }> {
    const userId = this.requireUser(client);
    if (!body?.conversationId) return { ok: false };

    const result = await this.chat.markRead(body.conversationId, userId);
    this.server
      .to(`conv:${body.conversationId}`)
      .emit('chat:read', { conversationId: body.conversationId, readerId: userId });

    return { ok: true, readCount: result.readCount };
  }

  /** "Yozmoqda…" — bazaga yozilmaydi, faqat uzatiladi. */
  @SubscribeMessage('chat:typing')
  onTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string; isTyping?: boolean },
  ): void {
    const userId = client.data.userId;
    if (!userId || !body?.conversationId) return;

    client.to(`conv:${body.conversationId}`).emit('chat:typing', {
      conversationId: body.conversationId,
      userId,
      isTyping: body.isTyping === true,
    });
  }

  /**
   * Buyurtma kuzatuviga obuna.
   *
   * Xonaga faqat buyurtma ishtirokchisi kira oladi — aks holda ID'ni
   * bilgan har kim haydovchining joylashuvini kuzatishi mumkin bo'lardi.
   */
  @SubscribeMessage('order:subscribe')
  async onOrderSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const userId = this.requireUser(client);
    if (!body?.orderId) return { ok: false, error: 'orderId kerak' };

    try {
      await this.tracking.lastLocation(body.orderId, userId);
    } catch (error) {
      return { ok: false, error: error instanceof AppError ? error.code : 'ERROR' };
    }

    await client.join(`order:${body.orderId}`);
    return { ok: true };
  }

  /**
   * Haydovchi joylashuvi.
   *
   * WebSocket asosiy yo'l: 10 soniyalik interval uchun HTTP so'rov
   * ochish-yopish ortiqcha yuk. Aloqa uzilsa ilova buferga yig'adi va
   * `POST /me/driver/location` orqali to'plam bilan yuboradi.
   */
  @SubscribeMessage('location:update')
  async onLocation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { points?: LocationPoint[]; lat?: number; lng?: number },
  ): Promise<{ ok: boolean; error?: string; tracking?: boolean; etaMinutes?: number | null }> {
    const userId = this.requireUser(client);

    // Bitta nuqta ham, to'plam ham qabul qilinadi
    const points =
      body?.points ??
      (typeof body?.lat === 'number' && typeof body?.lng === 'number'
        ? [{ lat: body.lat, lng: body.lng }]
        : []);

    if (points.length === 0) return { ok: false, error: 'Nuqta yuborilmadi' };

    try {
      const result = await this.tracking.record(userId, points);
      // `tracking: false` — reys yo'q, faqat matching keshi yangilandi.
      // Ilova buni ko'rib GPS chastotasini pasaytiradi (batareya tejaladi).
      return { ok: true, tracking: result.tracking, etaMinutes: result.live?.etaMinutes ?? null };
    } catch (error) {
      return { ok: false, error: error instanceof AppError ? error.code : 'ERROR' };
    }
  }

  private requireUser(client: AuthedSocket): string {
    const userId = client.data.userId;
    if (!userId) {
      client.disconnect(true);
      throw AppError.unauthorized('Sessiya yoʻq');
    }
    return userId;
  }
}

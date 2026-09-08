import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Aps, type MulticastMessage } from 'firebase-admin/messaging';

import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';
import { RedisService } from '@/infra/redis/redis.service';

interface QueuedPush {
  userId: string;
  payload: {
    type: string;
    title: string;
    body: string;
    deepLink: string | null;
    channel: string;
    data: Record<string, unknown>;
  };
}

/**
 * FCM push — ilova yopiq yoki fonda boʻlganda ekran yuqorisidan sirgʻaluvchi
 * (heads-up) bildirishnoma.
 *
 * MUHIM ANDROID TAFSILOTI: bildirishnoma "sirgʻalib chiqishi" uchun
 * `channel_id` ga mos kanal ilovada `IMPORTANCE_HIGH` bilan yaratilgan
 * boʻlishi shart. Serverdan yuborilgan `priority: high` yolgʻiz oʻzi
 * yetarli emas — kanal muhimligi past boʻlsa bildirishnoma jimgina
 * "shторка" ga tushadi. Kanallar mobil ilovada bir marta yaratiladi va
 * keyin oʻzgartirib boʻlmaydi (Android cheklovi).
 *
 * iOS: `interruption-level: time-sensitive` — Focus rejimi yoqilgan boʻlsa
 * ham chat va buyurtma bildirishnomasi oʻtadi.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    private readonly redis: RedisService,
    private readonly database: DatabaseService,
  ) {}

  onModuleInit(): void {
    const projectId = this.config.get('FCM_PROJECT_ID', { infer: true });
    const clientEmail = this.config.get('FCM_CLIENT_EMAIL', { infer: true });
    const privateKey = this.config.get('FCM_PRIVATE_KEY', { infer: true });

    if (projectId && clientEmail && privateKey) {
      this.app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      this.logger.log('FCM ulandi');
    } else {
      // SMS'dagi kabi: dev'da kalitsiz ishlaydi, faqat logga yozadi
      this.logger.warn('FCM sozlanmagan — push faqat logga yoziladi (dev rejim)');
    }

    this.running = true;
    void this.consume();
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * Navbatdan push oladi va yuboradi.
   *
   * NEGA NAVBAT: FCM chaqiruvi tashqi HTTP — 200-500 ms. Buyurtma statusini
   * oʻzgartirgan foydalanuvchi buni kutib turmasligi kerak. Navbat yana
   * bitta foyda beradi: FCM vaqtincha ishlamasa xabarlar yoʻqolmaydi.
   */
  private async consume(): Promise<void> {
    if (!this.running) return;

    try {
      const raw = await this.redis.client.rpop('push:queue');
      if (raw) {
        await this.send(JSON.parse(raw) as QueuedPush);
        // Navbatda yana bor — darhol keyingisiga oʻtamiz
        setImmediate(() => void this.consume());
        return;
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Push navbatini qayta ishlashda xato');
    }

    // Navbat boʻsh — 1 soniyadan keyin qaraymiz
    this.timer = setTimeout(() => void this.consume(), 1000);
  }

  private async send(item: QueuedPush): Promise<void> {
    const devices = await this.database.db
      .selectFrom('devices')
      .select(['id', 'fcmToken', 'platform'])
      .where('userId', '=', item.userId)
      .where('isActive', '=', true)
      .execute();

    if (devices.length === 0) {
      this.logger.debug({ userId: item.userId }, 'Push yuborilmadi — faol qurilma yoʻq');
      return;
    }

    if (!this.app) {
      this.logger.log(
        { userId: item.userId, title: item.payload.title, devices: devices.length },
        `PUSH (dev) → ${item.payload.title}: ${item.payload.body}`,
      );
      return;
    }

    const message: MulticastMessage = {
      tokens: devices.map((device) => device.fcmToken),
      notification: { title: item.payload.title, body: item.payload.body },
      data: {
        type: item.payload.type,
        deepLink: item.payload.deepLink ?? '',
        ...Object.fromEntries(
          Object.entries(item.payload.data).map(([key, value]) => [key, String(value)]),
        ),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: item.payload.channel,
          sound: 'default',
          // Heads-up uchun: kanal IMPORTANCE_HIGH boʻlsa bu ham talab qilinadi
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: {
          aps: {
            sound: 'default',
            'interruption-level': 'time-sensitive',
          } as Aps,
        },
      },
    };

    try {
      const response = await getMessaging(this.app).sendEachForMulticast(message);

      // Yaroqsiz tokenlarni oʻchiramiz — aks holda ular abadiy qoladi va
      // har safar keraksiz xato beradi
      const dead: string[] = [];
      response.responses.forEach((result, index) => {
        const code = result.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          dead.push(devices[index].id);
        }
      });

      if (dead.length > 0) {
        await this.database.db
          .updateTable('devices')
          .set({ isActive: false })
          .where('id', 'in', dead)
          .execute();
        this.logger.log({ count: dead.length }, 'Yaroqsiz FCM tokenlar oʻchirildi');
      }

      this.logger.debug(
        { userId: item.userId, success: response.successCount, failure: response.failureCount },
        'Push yuborildi',
      );
    } catch (error) {
      this.logger.error({ err: error, userId: item.userId }, 'Push yuborilmadi');
    }
  }
}

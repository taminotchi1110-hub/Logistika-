import { Injectable, Logger } from '@nestjs/common';

import { RateLimitService } from '@/common/services/rate-limit.service';

export interface WsRule {
  limit: number;
  windowSeconds: number;
}

/**
 * WebSocket hodisalari uchun limit.
 *
 * NEGA HTTP GUARD YETMAYDI: u faqat soʻrovlarni koʻradi. Ochiq soket esa
 * bitta "soʻrov" — undan keyin mijoz istagancha hodisa yuborishi mumkin.
 * Cheklovsiz `chat:message` — spam va bildirishnoma seli; cheklovsiz
 * `location:update` — bazaga yozuv seli (har nuqta uchun INSERT).
 *
 * CHEGARALAR NORMAL XATTI-HARAKATDAN ANCHA YUQORI: ilova 10 soniyada bir
 * marta joylashuv yuboradi (6/min), odam esa daqiqasiga 30 ta xabar
 * yozmaydi. Yaʼni haqiqiy foydalanuvchi buni sezmaydi.
 */
export const WS_LIMITS: Record<string, WsRule> = {
  'chat:message': { limit: 30, windowSeconds: 60 },
  'chat:read': { limit: 60, windowSeconds: 60 },
  'chat:typing': { limit: 120, windowSeconds: 60 },
  'chat:join': { limit: 60, windowSeconds: 60 },
  'order:subscribe': { limit: 60, windowSeconds: 60 },
  // Oflayn buferdan keyin bir necha nuqta ketma-ket kelishi mumkin
  'location:update': { limit: 60, windowSeconds: 60 },
};

@Injectable()
export class WsRateLimiter {
  private readonly logger = new Logger(WsRateLimiter.name);

  constructor(private readonly rateLimit: RateLimitService) {}

  /**
   * Hodisaga ruxsatmi?
   *
   * REDIS ISHLAMASA — RUXSAT: limit himoya qatlami, u tushib qolgani
   * uchun chat va kuzatuv toʻxtamasligi kerak (HTTP guard ham shunday).
   */
  async allow(event: string, userId: string): Promise<boolean> {
    const rule = WS_LIMITS[event];
    if (!rule) return true;

    try {
      const result = await this.rateLimit.consume(
        `ws:${event}:${userId}`,
        rule.limit,
        rule.windowSeconds,
      );
      if (!result.allowed) {
        this.logger.warn({ event, userId, current: result.current }, 'WS limiti oshdi');
      }
      return result.allowed;
    } catch (error) {
      this.logger.warn({ err: error, event }, 'WS limiti tekshirilmadi — oʻtkazildi');
      return true;
    }
  }
}

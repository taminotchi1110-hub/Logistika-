import { Injectable } from '@nestjs/common';

import { RedisService } from '@/infra/redis/redis.service';

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Redis asosidagi rate limiter (fixed window).
 *
 * Nega alohida servis, @nestjs/throttler emas: bizga IP boʻyicha emas,
 * TELEFON RAQAMI boʻyicha cheklov kerak (OTP flood — toʻgʻridan-toʻgʻri pul
 * sarfi, har bir SMS ~50–80 soʻm). Bundan tashqari bir nechta oyna bir vaqtda
 * tekshiriladi: 60 s / 1 soat / 1 kun.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Sanagichni oshiradi va limitdan oshgan-oshmaganini qaytaradi.
   * Oshgan boʻlsa ham sanagich oshadi — bu ataylab: hujumchi urinishda davom
   * etsa, oyna oxirigacha bloklangan qoladi.
   */
  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const redisKey = `rl:${key}`;
    const current = await this.redis.incrementWithTtl(redisKey, windowSeconds);
    const ttl = await this.redis.ttl(redisKey);

    return {
      allowed: current <= limit,
      current,
      limit,
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  /**
   * Cooldown: kalit bo'sh bo'lsa qo'yadi va `true` qaytaradi.
   * Band bo'lsa qancha kutish kerakligini qaytaradi.
   */
  async acquireCooldown(
    key: string,
    seconds: number,
  ): Promise<{ acquired: boolean; retryAfterSeconds: number }> {
    const redisKey = `cd:${key}`;
    const acquired = await this.redis.setIfAbsent(redisKey, '1', seconds);
    if (acquired) return { acquired: true, retryAfterSeconds: 0 };
    const ttl = await this.redis.ttl(redisKey);
    return { acquired: false, retryAfterSeconds: ttl > 0 ? ttl : seconds };
  }

  async releaseCooldown(key: string): Promise<void> {
    await this.redis.client.del(`cd:${key}`);
  }
}

import type { RedisService } from '@/infra/redis/redis.service';

import { RateLimitService } from './rate-limit.service';

/** Redis'ning soddalashtirilgan xotira ichidagi modeli. */
function createRedisStub() {
  const counters = new Map<string, number>();
  const cooldowns = new Map<string, number>();
  const ttls = new Map<string, number>();

  return {
    counters,
    cooldowns,
    ttls,
    client: {
      del: jest.fn(async (key: string) => {
        cooldowns.delete(key);
        return 1;
      }),
    },
    incrementWithTtl: jest.fn(async (key: string, ttl: number) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      if (!ttls.has(key)) ttls.set(key, ttl);
      return next;
    }),
    setIfAbsent: jest.fn(async (key: string, _value: string, ttl: number) => {
      if (cooldowns.has(key)) return false;
      cooldowns.set(key, ttl);
      ttls.set(key, ttl);
      return true;
    }),
    ttl: jest.fn(async (key: string) => ttls.get(key) ?? -1),
  };
}

describe('RateLimitService', () => {
  let redis: ReturnType<typeof createRedisStub>;
  let service: RateLimitService;

  beforeEach(() => {
    redis = createRedisStub();
    service = new RateLimitService(redis as unknown as RedisService);
  });

  describe('consume', () => {
    it('limitgacha ruxsat beradi', async () => {
      const first = await service.consume('otp:hour:+998901234567', 3, 3600);
      const second = await service.consume('otp:hour:+998901234567', 3, 3600);
      const third = await service.consume('otp:hour:+998901234567', 3, 3600);

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(true);
      expect(third.allowed).toBe(true);
      expect(third.current).toBe(3);
    });

    it('limitdan oshganda bloklaydi', async () => {
      for (let i = 0; i < 3; i++) await service.consume('key', 3, 3600);
      const blocked = await service.consume('key', 3, 3600);

      expect(blocked.allowed).toBe(false);
      expect(blocked.current).toBe(4);
      expect(blocked.retryAfterSeconds).toBe(3600);
    });

    it('bloklangandan keyin ham sanagich oshadi — hujumchi oyna oxirigacha bloklangan qoladi', async () => {
      for (let i = 0; i < 10; i++) await service.consume('key', 3, 3600);
      const result = await service.consume('key', 3, 3600);
      expect(result.current).toBe(11);
      expect(result.allowed).toBe(false);
    });

    it('turli kalitlar bir-biriga taʼsir qilmaydi', async () => {
      await service.consume('a', 1, 60);
      const other = await service.consume('b', 1, 60);
      expect(other.allowed).toBe(true);
    });
  });

  describe('acquireCooldown', () => {
    it('birinchi marta olinadi', async () => {
      const result = await service.acquireCooldown('otp:+998901234567', 60);
      expect(result.acquired).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('ikkinchi marta band va qancha kutish kerakligini aytadi', async () => {
      await service.acquireCooldown('otp:+998901234567', 60);
      const second = await service.acquireCooldown('otp:+998901234567', 60);

      expect(second.acquired).toBe(false);
      expect(second.retryAfterSeconds).toBe(60);
    });

    it('boʻshatilgandan keyin qayta olinadi', async () => {
      await service.acquireCooldown('otp:+998901234567', 60);
      await service.releaseCooldown('otp:+998901234567');
      const again = await service.acquireCooldown('otp:+998901234567', 60);

      expect(again.acquired).toBe(true);
    });
  });
});

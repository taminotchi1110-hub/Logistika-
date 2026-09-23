import type { RateLimitService } from '@/common/services/rate-limit.service';

import { WS_LIMITS, WsRateLimiter } from './ws-rate-limit';

function createLimiter() {
  const counters = new Map<string, number>();
  const rateLimit = {
    consume: jest.fn(async (key: string, limit: number) => {
      const current = (counters.get(key) ?? 0) + 1;
      counters.set(key, current);
      return { allowed: current <= limit, current, limit, retryAfterSeconds: 30 };
    }),
  };

  return {
    rateLimit,
    limiter: new WsRateLimiter(rateLimit as unknown as RateLimitService),
  };
}

/**
 * WebSocket limiti.
 *
 * Ochiq soket — bitta "soʻrov": HTTP guard undan keyingi hodisalarni
 * umuman koʻrmaydi.
 */
describe('WsRateLimiter', () => {
  it('★ CHEGARAGACHA OʻTKAZADI, OSHGANDA RAD ETADI', async () => {
    const { limiter } = createLimiter();
    const rule = WS_LIMITS['chat:message']!;

    for (let i = 0; i < rule.limit; i++) {
      await expect(limiter.allow('chat:message', 'u-1')).resolves.toBe(true);
    }

    await expect(limiter.allow('chat:message', 'u-1')).resolves.toBe(false);
  });

  it('★ HISOB HAR FOYDALANUVCHI VA HAR HODISA UCHUN ALOHIDA', async () => {
    const { limiter } = createLimiter();
    const rule = WS_LIMITS['chat:message']!;
    for (let i = 0; i <= rule.limit; i++) await limiter.allow('chat:message', 'u-1');

    // Boshqa odam spam qilgani uchun bu foydalanuvchi bloklanmaydi
    await expect(limiter.allow('chat:message', 'u-2')).resolves.toBe(true);
    // Xabar limiti tugagani kuzatuvni toʻxtatmaydi
    await expect(limiter.allow('location:update', 'u-1')).resolves.toBe(true);
  });

  it('roʻyxatda yoʻq hodisa cheklanmaydi', async () => {
    const { limiter, rateLimit } = createLimiter();

    await expect(limiter.allow('chat:leave', 'u-1')).resolves.toBe(true);
    expect(rateLimit.consume).not.toHaveBeenCalled();
  });

  it('★ REDIS ISHLAMASA — CHAT VA KUZATUV TOʻXTAMAYDI', async () => {
    const { limiter, rateLimit } = createLimiter();
    rateLimit.consume.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(limiter.allow('chat:message', 'u-1')).resolves.toBe(true);
  });

  it('★ CHEGARALAR NORMAL ILOVADAN YUQORI', async () => {
    // Ilova 10 soniyada bir marta joylashuv yuboradi — 6/min. Chegara
    // undan sezilarli yuqori boʻlmasa, haqiqiy haydovchi bloklanardi
    expect(WS_LIMITS['location:update']!.limit).toBeGreaterThanOrEqual(30);
    expect(WS_LIMITS['chat:message']!.limit).toBeGreaterThanOrEqual(20);
  });
});

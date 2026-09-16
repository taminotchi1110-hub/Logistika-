import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { RateLimit, SkipRateLimit } from '@/common/decorators';
import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import type { RateLimitService } from '@/common/services/rate-limit.service';
import type { Env } from '@/config/env.schema';

import { HttpRateLimitGuard } from './http-rate-limit.guard';

/** Xotira ichidagi hisoblagich — Redis oʻrniga. */
function createLimiter() {
  const counters = new Map<string, number>();
  return {
    counters,
    consume: jest.fn(async (key: string, limit: number) => {
      const current = (counters.get(key) ?? 0) + 1;
      counters.set(key, current);
      return { allowed: current <= limit, current, limit, retryAfterSeconds: 42 };
    }),
  };
}

class Plain {
  handle() {}
}

class Webhooks {
  @SkipRateLimit()
  handle() {}
}

class Geo {
  @RateLimit({ limit: 2, windowSeconds: 60 })
  handle() {}
}

type Target = { prototype: { handle: () => void } };

function context(target: Target, request: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  const ctx = {
    getType: () => 'http',
    getHandler: () => target.prototype.handle,
    getClass: () => target,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      }),
    }),
  } as unknown as ExecutionContext;

  return { ctx, headers };
}

function createGuard(limiter: ReturnType<typeof createLimiter>, perMinute = 3) {
  const config = { get: () => perMinute } as unknown as ConfigService<Env, true>;
  return new HttpRateLimitGuard(new Reflector(), limiter as unknown as RateLimitService, config);
}

describe('HttpRateLimitGuard', () => {
  it('limitgacha oʻtkazadi', async () => {
    const guard = createGuard(createLimiter());
    const { ctx } = context(Plain, { ip: '10.0.0.1' });

    for (let i = 0; i < 3; i++) await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('★ LIMITDAN OSHSA — 429 VA Retry-After', async () => {
    const guard = createGuard(createLimiter());
    const { ctx, headers } = context(Plain, { ip: '10.0.0.1' });
    for (let i = 0; i < 3; i++) await guard.canActivate(ctx);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: ErrorCode.RATE_LIMITED });
    expect(headers['Retry-After']).toBe('42');
  });

  it('★ TIZIMGA KIRGANLAR IP BOʻYICHA EMAS, FOYDALANUVCHI BOʻYICHA', async () => {
    // Bitta operator IP si (CGNAT) ortidagi ikki begona odam bir-birini bloklamaydi
    const guard = createGuard(createLimiter());
    const first = context(Plain, { ip: '84.54.0.1', user: { id: 'u-1' } }).ctx;
    const second = context(Plain, { ip: '84.54.0.1', user: { id: 'u-2' } }).ctx;
    for (let i = 0; i < 3; i++) await guard.canActivate(first);

    await expect(guard.canActivate(first)).rejects.toBeInstanceOf(AppError);
    await expect(guard.canActivate(second)).resolves.toBe(true);
  });

  it('★ TOʻLOV WEBHOOKLARI CHEKLANMAYDI', async () => {
    const limiter = createLimiter();
    const guard = createGuard(limiter);
    const { ctx } = context(Webhooks, { ip: '10.0.0.1' });

    for (let i = 0; i < 10; i++) await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it('qimmat endpointning qoʻshimcha limiti ham ishlaydi', async () => {
    const guard = createGuard(createLimiter(), 100);
    const { ctx } = context(Geo, { ip: '10.0.0.1', user: { id: 'u-1' } });
    await guard.canActivate(ctx);
    await guard.canActivate(ctx);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: ErrorCode.RATE_LIMITED });
  });

  it('★ REDIS ISHLAMASA — SOʻROV OʻTKAZILADI', async () => {
    const limiter = createLimiter();
    limiter.consume.mockRejectedValue(new Error('ECONNREFUSED'));
    const guard = createGuard(limiter);

    await expect(guard.canActivate(context(Plain, { ip: '10.0.0.1' }).ctx)).resolves.toBe(true);
  });
});

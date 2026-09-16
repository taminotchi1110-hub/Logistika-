import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';

import {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
  type RateLimitOptions,
  type RequestWithUser,
} from '@/common/decorators';
import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { RateLimitService } from '@/common/services/rate-limit.service';
import type { Env } from '@/config/env.schema';

/**
 * Umumiy HTTP limiti — har bir endpoint uchun, sukut boʻyicha.
 *
 * KALIT — FOYDALANUVCHI, IP EMAS (tizimga kirgan boʻlsa). Oʻzbekistonda
 * mobil operatorlar koʻp abonentni bitta tashqi IP orqali chiqaradi
 * (CGNAT): faqat IP boʻyicha limit bir-biriga begona odamlarni bir-biri
 * sababli bloklardi. Shuning uchun guard JWT guardʻdan KEYIN turadi va
 * `request.user` tayyor boʻladi; ochiq endpointlarda (OTP, refresh,
 * spravochnik) — IP boʻyicha.
 *
 * REDIS ISHLAMASA — SOʻROV OʻTKAZILADI: limit himoya qatlami, ishlamay
 * qolsa butun API'ni toʻxtatib qoʻymasligi kerak. Redis nosozligi
 * `/health/ready` da alohida koʻrinadi.
 */
@Injectable()
export class HttpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(HttpRateLimitGuard.name);
  private readonly perMinute: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.perMinute = config.get('HTTP_RATE_LIMIT_PER_MINUTE', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const subject = request.user
      ? `u:${request.user.id}`
      : `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;

    try {
      const general = await this.rateLimit.consume(`http:${subject}`, this.perMinute, 60);
      if (!general.allowed) this.reject(context, general.retryAfterSeconds);

      const route = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
        RATE_LIMIT_KEY,
        targets,
      );
      if (route) {
        const scope = `${context.getClass().name}.${context.getHandler().name}`;
        const result = await this.rateLimit.consume(
          `http:${scope}:${subject}`,
          route.limit,
          route.windowSeconds,
        );
        if (!result.allowed) this.reject(context, result.retryAfterSeconds);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.warn({ err: error }, 'Limit tekshirilmadi (Redis?) — soʻrov oʻtkazildi');
    }

    return true;
  }

  private reject(context: ExecutionContext, retryAfterSeconds: number): never {
    // Standart sarlavha: toʻgʻri yozilgan mijoz qancha kutishni biladi
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(retryAfterSeconds));

    throw AppError.tooManyRequests(
      'Juda koʻp soʻrov. Birozdan keyin urinib koʻring.',
      ErrorCode.RATE_LIMITED,
      { retryAfterSeconds },
    );
  }
}

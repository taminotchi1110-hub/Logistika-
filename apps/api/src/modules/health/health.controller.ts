import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public, SkipRateLimit } from '@/common/decorators';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';
import { RedisService } from '@/infra/redis/redis.service';

interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

@ApiTags('health')
// Orkestrator sogʻliqni tez-tez soʻraydi va limitga tushsa podni oʻlik
// deb hisoblab qayta ishga tushirardi
@SkipRateLimit()
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  private readonly apiPrefix: string;
  private readonly docsEnabled: boolean;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    const nodeEnv = config.get('NODE_ENV', { infer: true });
    this.apiPrefix = config.get('API_PREFIX', { infer: true });
    // `main.ts` dagi shart bilan bir xil: prodda Swagger yopiq
    this.docsEnabled =
      !(nodeEnv === 'production' || nodeEnv === 'staging') || process.env.ENABLE_SWAGGER === 'true';
  }

  /**
   * Ildiz manzil.
   *
   * API `/v1` prefiksida ishlaydi, shuning uchun brauzerda `/` ochilganda
   * "Cannot GET /" chiqardi — bu ishlamayotgandek koʻrinadi. Endi xizmat
   * nomi va asosiy manzillar qaytadi.
   *
   * Maxfiy maʼlumot yoʻq: versiya ham, ichki tafsilot ham berilmaydi,
   * hujjat havolasi esa faqat u ochiq boʻlganda koʻrsatiladi.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Xizmat haqida qisqa maʼlumot' })
  root() {
    return {
      name: 'Karvon API',
      status: 'ok',
      api: `/${this.apiPrefix}`,
      health: '/health',
      ...(this.docsEnabled ? { docs: '/docs' } : {}),
    };
  }

  /**
   * Liveness: "jarayon tirikmi?" — hech qanday tashqi bogʻliqlikka tegmaydi.
   * Kubernetes buni koʻrib podni qayta ishga tushiradi. Agar bu yerda bazani
   * tekshirsak, baza qisqa uzilganda butun klaster qayta ishga tushib ketardi.
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000) };
  }

  /**
   * Readiness: "trafik qabul qila oladimi?" — baza va Redis tekshiriladi.
   * Bogʻliqlik yiqilsa pod trafikdan chiqariladi, lekin oʻldirilmaydi.
   */
  @Public()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready(@Res({ passthrough: true }) response: Response) {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const healthy = database.status === 'up' && redis.status === 'up';

    response.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: healthy ? 'ok' : 'degraded', dependencies: { database, redis } };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      await this.database.ping();
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return { status: 'down', error: error instanceof Error ? error.message : 'unknown' };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      await this.redis.ping();
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return { status: 'down', error: error instanceof Error ? error.message : 'unknown' };
    }
  }
}

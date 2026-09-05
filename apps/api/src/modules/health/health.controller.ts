import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '@/common/decorators';
import { DatabaseService } from '@/infra/database/database.service';
import { RedisService } from '@/infra/redis/redis.service';

interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

@ApiTags('health')
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

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

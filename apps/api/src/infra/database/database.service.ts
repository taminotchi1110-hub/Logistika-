import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool, types as pgTypes } from 'pg';

import type { Env } from '@/config/env.schema';

import type { Database } from './database.types';

/**
 * PostgreSQL ulanishi va Kysely instansi.
 *
 * Nega Kysely (ORM emas):
 *  1. PostGIS, partitioning, CTE, window funksiyalari — hech qanday cheklovsiz.
 *  2. To'liq tip xavfsizligi, lekin kodgeneratsiya bosqichisiz.
 *  3. Generatsiya qilingan SQL o'qiladigan va bashorat qilinadigan bo'ladi —
 *     `EXPLAIN ANALYZE` bilan optimallashtirish oson.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly db: Kysely<Database>;
  private readonly pool: Pool;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    // NUMERIC (OID 1700) — JS `number` ga aylantirilmaydi: katta pul summalarida
    // aniqlik yo'qoladi. String bo'lib keladi va ilovada ataylab o'giriladi.
    pgTypes.setTypeParser(pgTypes.builtins.NUMERIC, (value) => value);
    // BIGINT (OID 20) ham string — 2^53 dan katta qiymatlar buzilmasin.
    pgTypes.setTypeParser(pgTypes.builtins.INT8, (value) => value);

    this.pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: config.get('DATABASE_POOL_MAX', { infer: true }),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // Uzoq davom etadigan so'rov butun poolni bo'g'masin
      statement_timeout: 10_000,
      application_name: 'karvon-api',
    });

    this.pool.on('error', (error) => {
      this.logger.error({ err: error }, 'Kutilmagan PostgreSQL pool xatosi');
    });

    this.db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: this.pool }),
      // camelCase (TS) ↔ snake_case (SQL) avtomatik moslashadi
      plugins: [new CamelCasePlugin()],
    });
  }

  /** Health-check uchun eng arzon so'rov. */
  async ping(): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}

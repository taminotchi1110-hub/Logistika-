import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'kysely';

import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';
import { RedisService } from '@/infra/redis/redis.service';
import { LoadsService } from '@/modules/loads/loads.service';
import { OffersService } from '@/modules/orders/offers.service';
import { OrdersService } from '@/modules/orders/orders.service';

/** OTP yozuvlari tez eskiradi: kod 5 daqiqa amal qiladi, yozuv esa qoladi. */
const OTP_RETENTION_DAYS = 30;
/** Kirish tarixi — "akkauntim buzildi" shikoyatini tekshirish oynasi. */
const LOGIN_HISTORY_RETENTION_DAYS = 365;

/** Qulf: deploy paytida eski va yangi konteyner bir vaqtda tirik boʻladi. */
const LOCK_KEY = 'maintenance:lock';
const LOCK_TTL_SECONDS = 300;

/** Bir siklda oldindan tekshiriladigan oylar (joriy + 2). */
const PARTITION_MONTHS_AHEAD = 2;

export interface MaintenanceSummary {
  /** Yangi yaratilgan bo'linmalar (bo'sh — hammasi joyida edi). */
  partitions: string[];
  expiredOffers: number;
  expiredLoads: number;
  autoCompletedOrders: number;
  deletedOtpRequests: number;
  deletedLoginHistory: number;
  /** Boshqa nusxa ishlayotgani uchun o'tkazib yuborildi. */
  skipped: boolean;
}

/**
 * Davriy texnik xizmat.
 *
 * NEGA KERAK: kodning bir necha joyida "scheduler chaqiradi" deb yozilgan
 * edi, lekin hech qanday scheduler YO'Q edi. Natijada:
 *   1. Yetkazilgan buyurtma mijoz tasdiqlamasa muddatsiz ochiq qolardi va
 *      escrow puli haydovchiga o'tmasdi — pul aynan `COMPLETED` da o'tadi.
 *   2. Muddati o'tgan taklif va e'lonlar "faol" bo'lib turaverardi.
 *   3. GPS jadvalining oylik bo'linmalari tugagach (0003 migratsiyasi 13
 *      oyni oldindan yaratadi) kuzatuv butunlay to'xtardi:
 *      `no partition of relation "driver_locations" found for row`.
 *   4. OTP va kirish tarixi yozuvlari cheksiz to'planardi — bu ham disk,
 *      ham maxfiylik masalasi (ularda telefon raqami bor).
 *
 * NEGA `@nestjs/schedule` EMAS: bitta interval va Redis qulfi yetarli,
 * qo'shimcha bog'liqlik kerak emas. Qulf bir vaqtda ikkita nusxa
 * ishlashini to'xtatadi.
 */
@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly intervalMinutes: number;
  private readonly autoCompleteHours: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly orders: OrdersService,
    private readonly offers: OffersService,
    private readonly loads: LoadsService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.intervalMinutes = config.get('MAINTENANCE_INTERVAL_MINUTES', { infer: true });
    this.autoCompleteHours = config.get('ORDER_AUTO_COMPLETE_HOURS', { infer: true });
  }

  onModuleInit(): void {
    if (this.intervalMinutes <= 0) {
      this.logger.warn('Texnik xizmat oʻchirilgan (MAINTENANCE_INTERVAL_MINUTES=0)');
      return;
    }

    this.timer = setInterval(() => void this.runSafely(), this.intervalMinutes * 60_000);
    // `unref` — taymer jarayonni tirik ushlab turmaydi: SIGTERM da konteyner
    // darhol yopiladi, orkestrator uni "osilib qoldi" deb hisoblamaydi
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runSafely(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error({ err: error }, 'Texnik xizmat yiqildi');
    }
  }

  /**
   * Barcha ishlar. Har bir qadam alohida himoyalangan: bittasi yiqilsa
   * (masalan baza band) qolganlari baribir bajariladi.
   *
   * `force` — admin qo'lda ishga tushirganda: u qulfni kutmaydi.
   */
  async run(options: { force?: boolean } = {}): Promise<MaintenanceSummary> {
    const summary: MaintenanceSummary = {
      partitions: [],
      expiredOffers: 0,
      expiredLoads: 0,
      autoCompletedOrders: 0,
      deletedOtpRequests: 0,
      deletedLoginHistory: 0,
      skipped: false,
    };

    if (!options.force) {
      const acquired = await this.redis.setIfAbsent(LOCK_KEY, String(Date.now()), LOCK_TTL_SECONDS);
      if (!acquired) {
        this.logger.log('Texnik xizmat boshqa nusxada ketmoqda — oʻtkazib yuborildi');
        return { ...summary, skipped: true };
      }
    }

    summary.partitions = await this.safe('boʻlinmalar', () => this.ensurePartitions(), []);
    summary.expiredOffers = await this.safe('takliflar', () => this.offers.expireOverdue(), 0);
    summary.expiredLoads = await this.safe('eʼlonlar', () => this.loads.expireOverdue(), 0);
    summary.autoCompletedOrders = await this.safe(
      'buyurtmalar',
      () => this.orders.autoCompleteDelivered(this.autoCompleteHours),
      0,
    );
    summary.deletedOtpRequests = await this.safe('OTP tozalash', () => this.purgeOtpRequests(), 0);
    summary.deletedLoginHistory = await this.safe(
      'kirish tarixi',
      () => this.purgeLoginHistory(),
      0,
    );

    this.logger.log(summary, 'Texnik xizmat yakunlandi');
    return summary;
  }

  private async safe<T>(task: string, run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.logger.error({ err: error, task }, 'Texnik xizmat qadami yiqildi');
      return fallback;
    }
  }

  /**
   * GPS jadvalining oylik boʻlinmalari.
   *
   * 0003 migratsiyasi 13 oyni oldindan yaratadi va shu yerda roʻyxat
   * "ushlab turiladi". Boʻlinma boʻlmasa INSERT xato beradi — kuzatuv
   * jimgina emas, BUTUNLAY toʻxtaydi.
   */
  private async ensurePartitions(): Promise<string[]> {
    const created: string[] = [];

    for (let offset = 0; offset <= PARTITION_MONTHS_AHEAD; offset++) {
      const result = await this.ensurePartition(offset);
      // Funksiya "(allaqachon bor)" yoki "(yaratildi)" deb qaytaradi
      if (result.includes('yaratildi')) created.push(result);
    }

    if (created.length > 0) {
      this.logger.log({ created }, 'Yangi boʻlinma yaratildi');
    }
    return created;
  }

  /** Alohida metod — testda almashtirish uchun (xom SQL). */
  protected async ensurePartition(offsetMonths: number): Promise<string> {
    const interval = `${offsetMonths} month`;
    const result = await sql<{ name: string }>`
      SELECT ensure_driver_locations_partition((CURRENT_DATE + ${interval}::INTERVAL)::date) AS name
    `.execute(this.database.db);

    return result.rows[0]?.name ?? '';
  }

  private async purgeOtpRequests(): Promise<number> {
    const threshold = new Date(Date.now() - OTP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await this.database.db
      .deleteFrom('otpRequests')
      .where('createdAt', '<', threshold)
      .executeTakeFirst();

    return Number(deleted?.numDeletedRows ?? 0);
  }

  private async purgeLoginHistory(): Promise<number> {
    const threshold = new Date(Date.now() - LOGIN_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await this.database.db
      .deleteFrom('loginHistory')
      .where('createdAt', '<', threshold)
      .executeTakeFirst();

    return Number(deleted?.numDeletedRows ?? 0);
  }
}

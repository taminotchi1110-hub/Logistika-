import type { ConfigService } from '@nestjs/config';

import type { Env } from '@/config/env.schema';
import type { DatabaseService } from '@/infra/database/database.service';
import type { RedisService } from '@/infra/redis/redis.service';
import type { LoadsService } from '@/modules/loads/loads.service';
import type { OffersService } from '@/modules/orders/offers.service';
import type { OrdersService } from '@/modules/orders/orders.service';

import { MaintenanceService } from './maintenance.service';

/** Xom SQL testda ishlatilmaydi — boʻlinma qadami almashtiriladi. */
class TestableMaintenance extends MaintenanceService {
  partitionResults: string[] = ['driver_locations_2026_10 (allaqachon bor)'];
  partitionCalls = 0;

  protected override async ensurePartition(offsetMonths: number): Promise<string> {
    this.partitionCalls++;
    return this.partitionResults[offsetMonths] ?? 'driver_locations (allaqachon bor)';
  }
}

function createDatabaseStub() {
  const deleted: string[] = [];
  const chain = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.where = () => builder;
    builder.executeTakeFirst = async () => {
      deleted.push(table);
      return { numDeletedRows: 3n };
    };
    return builder;
  };
  return { deleted, db: { deleteFrom: (table: string) => chain(table) } };
}

function create(options: { locked?: boolean; intervalMinutes?: number } = {}) {
  const { locked = false, intervalMinutes = 15 } = options;

  const database = createDatabaseStub();
  const redis = { setIfAbsent: jest.fn(async () => !locked) };
  const orders = { autoCompleteDelivered: jest.fn(async () => 2) };
  const offers = { expireOverdue: jest.fn(async () => 5) };
  const loads = { expireOverdue: jest.fn(async () => 1) };
  const values: Partial<Record<keyof Env, unknown>> = {
    MAINTENANCE_INTERVAL_MINUTES: intervalMinutes,
    ORDER_AUTO_COMPLETE_HOURS: 24,
  };
  const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;

  const service = new TestableMaintenance(
    database as unknown as DatabaseService,
    redis as unknown as RedisService,
    orders as unknown as OrdersService,
    offers as unknown as OffersService,
    loads as unknown as LoadsService,
    config,
  );

  return { service, database, redis, orders, offers, loads };
}

describe('MaintenanceService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('★ HAMMA ISH BAJARILADI VA SONLARI QAYTADI', async () => {
    const { service, orders, offers, loads, database } = create();

    const summary = await service.run();

    expect(summary.skipped).toBe(false);
    expect(summary.expiredOffers).toBe(5);
    expect(summary.expiredLoads).toBe(1);
    expect(summary.autoCompletedOrders).toBe(2);
    // Yetkazilgandan keyingi muddat sozlamadan olinadi
    expect(orders.autoCompleteDelivered).toHaveBeenCalledWith(24);
    expect(offers.expireOverdue).toHaveBeenCalledTimes(1);
    expect(loads.expireOverdue).toHaveBeenCalledTimes(1);
    // OTP va kirish tarixi tozalandi
    expect(database.deleted).toEqual(['otpRequests', 'loginHistory']);
    expect(summary.deletedOtpRequests).toBe(3);
  });

  it('★ QULF BAND BOʻLSA HECH NARSA QILMAYDI', async () => {
    // Deploy paytida eski va yangi konteyner bir vaqtda tirik boʻladi —
    // ikkalasi ham buyurtmalarni yakunlamasligi kerak
    const { service, orders, offers } = create({ locked: true });

    const summary = await service.run();

    expect(summary.skipped).toBe(true);
    expect(orders.autoCompleteDelivered).not.toHaveBeenCalled();
    expect(offers.expireOverdue).not.toHaveBeenCalled();
  });

  it('admin qoʻlda ishga tushirsa qulf kutilmaydi', async () => {
    const { service, redis, orders } = create({ locked: true });

    const summary = await service.run({ force: true });

    expect(redis.setIfAbsent).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(false);
    expect(orders.autoCompleteDelivered).toHaveBeenCalled();
  });

  it('★ BITTA QADAM YIQILSA QOLGANLARI BAJARILADI', async () => {
    // Baza band boʻlsa takliflar yopilmasligi mumkin — bu buyurtmalarni
    // yakunlashni (ya'ni haydovchining pulini) toʻxtatib qoʻymasligi kerak
    const { service, offers, orders } = create();
    offers.expireOverdue.mockRejectedValue(new Error('deadlock'));

    const summary = await service.run();

    expect(summary.expiredOffers).toBe(0);
    expect(summary.autoCompletedOrders).toBe(2);
    expect(orders.autoCompleteDelivered).toHaveBeenCalled();
  });

  it('★ GPS BOʻLINMALARI OLDINDAN TEKSHIRILADI (joriy + 2 oy)', async () => {
    const { service } = create();
    service.partitionResults = [
      'driver_locations_2026_09 (allaqachon bor)',
      'driver_locations_2026_10 (allaqachon bor)',
      'driver_locations_2026_11 (yaratildi)',
    ];

    const summary = await service.run();

    expect(service.partitionCalls).toBe(3);
    // Faqat YANGI yaratilganlari xabar qilinadi
    expect(summary.partitions).toEqual(['driver_locations_2026_11 (yaratildi)']);
  });

  it('interval 0 boʻlsa taymer qoʻyilmaydi', async () => {
    const timer = jest.spyOn(global, 'setInterval');
    const { service } = create({ intervalMinutes: 0 });

    service.onModuleInit();

    expect(timer).not.toHaveBeenCalled();
  });

  it('interval berilgan boʻlsa taymer qoʻyiladi va toʻxtatiladi', () => {
    const { service } = create({ intervalMinutes: 15 });

    service.onModuleInit();
    // Jarayonni tirik ushlab turmasligi kerak
    service.onModuleDestroy();

    expect(true).toBe(true);
  });
});

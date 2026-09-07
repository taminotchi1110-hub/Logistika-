import type { DatabaseService } from '@/infra/database/database.service';

import { PricingService } from './pricing.service';

/**
 * Kysely zanjirini taqlid qiluvchi stub: har bir metod oʻzini qaytaradi,
 * `executeTakeFirst` esa berilgan natijani beradi.
 */
function createDatabaseStub(result: unknown): DatabaseService {
  const chain: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'executeTakeFirst') return async () => result;
      if (prop === 'execute') return async () => (result === undefined ? [] : [result]);
      return () => proxy;
    },
  };
  const proxy = new Proxy(chain, handler);
  return { db: proxy } as unknown as DatabaseService;
}

const TASHKENT_SAMARKAND = {
  fromRegionId: 1,
  toRegionId: 3,
  vehicleTypeIds: [4],
  distanceKm: 308,
};

describe('PricingService — tarif jadvali', () => {
  const service = new PricingService(createDatabaseStub(undefined));

  it('yengil yuk uchun kichik tarif qoʻllanadi', async () => {
    const light = await service.suggest({ ...TASHKENT_SAMARKAND, weightKg: 800 });
    const heavy = await service.suggest({ ...TASHKENT_SAMARKAND, weightKg: 18_000 });

    expect(light.suggestedPriceTiyin).toBeLessThan(heavy.suggestedPriceTiyin);
    expect(light.source).toBe('tariff');
  });

  it('ogʻirlik oshgani sari narx monoton oʻsadi', async () => {
    const weights = [500, 1_500, 4_000, 9_000, 18_000, 24_000];
    const prices: number[] = [];

    for (const weightKg of weights) {
      const result = await service.suggest({ ...TASHKENT_SAMARKAND, weightKg });
      prices.push(result.suggestedPriceTiyin);
    }

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  it('juda qisqa masofada minimal narx ishlaydi', async () => {
    const result = await service.suggest({
      ...TASHKENT_SAMARKAND,
      distanceKm: 3,
      weightKg: 800,
    });

    // 3 km × 3000 soʻm = 9 000 soʻm — bu real emas, minimal 60 000 soʻm
    expect(result.suggestedPriceTiyin).toBe(60_000 * 100);
  });

  it('narx 10 000 soʻmgacha yaxlitlanadi', async () => {
    const result = await service.suggest({ ...TASHKENT_SAMARKAND, weightKg: 4_500 });
    const soum = result.suggestedPriceTiyin / 100;

    expect(soum % 10_000).toBe(0);
  });

  it('min/max chegara tavsiya atrofida boʻladi', async () => {
    const result = await service.suggest({ ...TASHKENT_SAMARKAND, weightKg: 4_500 });

    expect(result.minPriceTiyin).toBeLessThan(result.suggestedPriceTiyin);
    expect(result.maxPriceTiyin).toBeGreaterThan(result.suggestedPriceTiyin);
  });

  it('Toshkent–Samarqand 5 t yuk uchun mantiqiy oraliqda', async () => {
    const result = await service.suggest({ ...TASHKENT_SAMARKAND, weightKg: 4_500 });
    const soum = result.suggestedPriceTiyin / 100;

    // 308 km × 5200 soʻm ≈ 1,6 mln — bozor darajasiga yaqin
    expect(soum).toBeGreaterThan(1_000_000);
    expect(soum).toBeLessThan(2_500_000);
  });
});

describe('PricingService — bozor statistikasi', () => {
  it('yetarli bitim boʻlsa median ishlatiladi', async () => {
    const service = new PricingService(
      createDatabaseStub({
        medianPriceTiyin: '185000000',
        p25PriceTiyin: '160000000',
        p75PriceTiyin: '210000000',
        ordersCount: 42,
      }),
    );

    const result = await service.suggest({ ...TASHKENT_SAMARKAND, weightKg: 4_500 });

    expect(result.source).toBe('market');
    expect(result.suggestedPriceTiyin).toBe(185_000_000);
    expect(result.minPriceTiyin).toBe(160_000_000);
    expect(result.sampleSize).toBe(42);
  });

  it('bitimlar kam boʻlsa (< 5) tarifga qaytadi — median ishonchsiz', async () => {
    const service = new PricingService(
      createDatabaseStub({
        medianPriceTiyin: '999000000',
        p25PriceTiyin: null,
        p75PriceTiyin: null,
        ordersCount: 3,
      }),
    );

    const result = await service.suggest({ ...TASHKENT_SAMARKAND, weightKg: 4_500 });

    expect(result.source).toBe('tariff');
    expect(result.suggestedPriceTiyin).not.toBe(999_000_000);
  });

  it('transport turi koʻrsatilmasa bozor statistikasi soʻralmaydi', async () => {
    const service = new PricingService(
      createDatabaseStub({ medianPriceTiyin: '1', ordersCount: 100 }),
    );

    const result = await service.suggest({
      ...TASHKENT_SAMARKAND,
      vehicleTypeIds: [],
      weightKg: 4_500,
    });

    expect(result.source).toBe('tariff');
  });
});

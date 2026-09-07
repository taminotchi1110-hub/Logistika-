import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/infra/database/database.service';

export interface PriceSuggestion {
  suggestedPriceTiyin: number;
  minPriceTiyin: number;
  maxPriceTiyin: number;
  /** `market` — real bitimlar statistikasi; `tariff` — boshlangʻich jadval. */
  source: 'market' | 'tariff';
  sampleSize: number;
}

/**
 * Boshlangʻich tarif jadvali (soʻm/km), yuk ogʻirligiga qarab.
 *
 * BU QIYMATLAR — VAQTINCHALIK. Platformada real bitimlar toʻplangach
 * `route_price_stats` medianasi ularni almashtiradi (`source: 'market'`).
 * Ular narxni **belgilamaydi**, faqat tavsiya qiladi: yuk beruvchi oʻzi
 * kiritadi, haydovchi oʻz taklifini beradi.
 */
const TARIFF_TIERS = [
  { maxWeightKg: 1_000, perKmSoum: 3_000, minSoum: 60_000 },
  { maxWeightKg: 2_000, perKmSoum: 3_800, minSoum: 80_000 },
  { maxWeightKg: 5_000, perKmSoum: 5_200, minSoum: 120_000 },
  { maxWeightKg: 10_000, perKmSoum: 7_000, minSoum: 200_000 },
  { maxWeightKg: 20_000, perKmSoum: 8_500, minSoum: 350_000 },
  { maxWeightKg: Number.POSITIVE_INFINITY, perKmSoum: 10_000, minSoum: 500_000 },
] as const;

const SOUM = 100; // 1 soʻm = 100 tiyin

@Injectable()
export class PricingService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Yoʻnalish va yuk boʻyicha narx tavsiyasi.
   *
   * Avval shu yoʻnalishdagi real bitimlar medianasi qidiriladi; boʻlmasa
   * tarif jadvali ishlatiladi. Ikkala holatda ham `source` qaytadi —
   * mijoz "bozor narxi" bilan "taxminiy tarif" ni farqlab koʻrsatadi.
   */
  async suggest(input: {
    fromRegionId: number;
    toRegionId: number;
    vehicleTypeIds: number[];
    distanceKm: number;
    weightKg: number;
  }): Promise<PriceSuggestion> {
    const market = await this.fromMarket(input);
    if (market) return market;

    return this.fromTariff(input.distanceKm, input.weightKg);
  }

  private async fromMarket(input: {
    fromRegionId: number;
    toRegionId: number;
    vehicleTypeIds: number[];
    distanceKm: number;
  }): Promise<PriceSuggestion | null> {
    if (input.vehicleTypeIds.length === 0) return null;

    const stats = await this.database.db
      .selectFrom('routePriceStats')
      .select(['medianPriceTiyin', 'p25PriceTiyin', 'p75PriceTiyin', 'ordersCount'])
      .where('fromRegionId', '=', input.fromRegionId)
      .where('toRegionId', '=', input.toRegionId)
      .where('vehicleTypeId', 'in', input.vehicleTypeIds)
      .orderBy('periodStart', 'desc')
      .executeTakeFirst();

    // 5 tadan kam bitim — median ishonchsiz, tarifga qaytamiz
    if (!stats || stats.ordersCount < 5) return null;

    const median = Number(stats.medianPriceTiyin);
    return {
      suggestedPriceTiyin: median,
      minPriceTiyin: Number(stats.p25PriceTiyin ?? Math.round(median * 0.8)),
      maxPriceTiyin: Number(stats.p75PriceTiyin ?? Math.round(median * 1.25)),
      source: 'market',
      sampleSize: stats.ordersCount,
    };
  }

  private fromTariff(distanceKm: number, weightKg: number): PriceSuggestion {
    const tier = TARIFF_TIERS.find((item) => weightKg <= item.maxWeightKg) ?? TARIFF_TIERS.at(-1)!;

    const bySoum = Math.max(tier.minSoum, Math.round(distanceKm * tier.perKmSoum));
    // 10 000 soʻmgacha yaxlitlaymiz — bozorda narxlar shunday aytiladi
    const rounded = Math.round(bySoum / 10_000) * 10_000;
    const suggested = rounded * SOUM;

    return {
      suggestedPriceTiyin: suggested,
      minPriceTiyin: Math.round(suggested * 0.8),
      maxPriceTiyin: Math.round(suggested * 1.3),
      source: 'tariff',
      sampleSize: 0,
    };
  }
}

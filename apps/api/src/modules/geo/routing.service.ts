import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  estimateDurationMin,
  estimateRoadKm,
  haversineKm,
  type Coordinates,
} from '@/common/utils/geo.util';
import type { Env } from '@/config/env.schema';
import { RedisService } from '@/infra/redis/redis.service';

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  /** Encoded polyline (precision 5) — mobil xaritada marshrut chizigʻi. */
  polyline: string | null;
  /** `osrm` — aniq yoʻl masofasi; `estimate` — taxminiy hisob. */
  source: 'osrm' | 'estimate';
}

interface OsrmRouteResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry?: string }[];
}

const CACHE_TTL_SECONDS = 6 * 3600;

/**
 * Marshrut va masofa.
 *
 * NEGA OʻZ OSRM'IMIZ:
 * Matching bitta yuk uchun oʻnlab nomzod boʻyicha masofa hisoblaydi. Kuniga
 * 100 000+ chaqiruv — Google/Yandex Directions API'da bu oyiga minglab dollar.
 * OSRM esa 4 GB RAM'li bitta konteynerda cheksiz ishlaydi.
 *
 * OSRM boʻlmasa (lokal ishlab chiqish) — haversine + yoʻl koeffitsienti bilan
 * taxmin qilinadi va natijada `source: 'estimate'` qaytadi, shunda hech kim
 * taxminiy raqamni aniq deb oʻylamaydi. Prodda OSRM majburiy (`env.schema.ts`).
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly osrmBaseUrl: string;
  private readonly timeoutMs: number;
  private osrmFailedAt = 0;

  constructor(
    @Inject(ConfigService) config: ConfigService<Env, true>,
    private readonly redis: RedisService,
  ) {
    this.osrmBaseUrl = config.get('OSRM_BASE_URL', { infer: true }) ?? '';
    this.timeoutMs = config.get('GEO_HTTP_TIMEOUT_MS', { infer: true });
  }

  async route(from: Coordinates, to: Coordinates): Promise<RouteResult> {
    const cacheKey = this.cacheKey(from, to);
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as RouteResult;

    const result = (await this.tryOsrm(from, to)) ?? this.estimate(from, to);

    // Taxminiy natija keshlanmaydi: OSRM koʻtarilishi bilan aniq qiymat kelsin
    if (result.source === 'osrm') {
      await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    }
    return result;
  }

  private async tryOsrm(from: Coordinates, to: Coordinates): Promise<RouteResult | null> {
    if (!this.osrmBaseUrl) return null;

    // Circuit breaker: OSRM yiqilgan boʻlsa har soʻrovda 8 soniya kutmaymiz
    if (Date.now() - this.osrmFailedAt < 30_000) return null;

    const url =
      `${this.osrmBaseUrl}/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=polyline&alternatives=false&steps=false`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);

      const body = (await response.json()) as OsrmRouteResponse;
      const route = body.routes?.[0];
      if (body.code !== 'Ok' || !route) throw new Error(`OSRM code=${body.code}`);

      return {
        distanceKm: Math.round((route.distance / 1000) * 100) / 100,
        durationMin: Math.round(route.duration / 60),
        polyline: route.geometry ?? null,
        source: 'osrm',
      };
    } catch (error) {
      this.osrmFailedAt = Date.now();
      this.logger.warn(
        { err: error },
        'OSRM javob bermadi — masofa taxminiy hisoblanadi (30 s davomida qayta urinilmaydi)',
      );
      return null;
    }
  }

  private estimate(from: Coordinates, to: Coordinates): RouteResult {
    const roadKm = Math.round(estimateRoadKm(haversineKm(from, to)) * 100) / 100;
    return {
      distanceKm: roadKm,
      durationMin: estimateDurationMin(roadKm),
      polyline: null,
      source: 'estimate',
    };
  }

  /** Koordinatalar ~100 m aniqlikda yaxlitlanadi — kesh samarasi oshadi. */
  private cacheKey(from: Coordinates, to: Coordinates): string {
    const round = (value: number): string => value.toFixed(3);
    return `route:${round(from.lat)},${round(from.lng)}:${round(to.lat)},${round(to.lng)}`;
  }
}

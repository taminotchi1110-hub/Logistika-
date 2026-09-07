import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { isValidCoordinate, type Coordinates } from '@/common/utils/geo.util';
import type { Env } from '@/config/env.schema';
import { RedisService } from '@/infra/redis/redis.service';

export interface GeoPlace {
  label: string;
  lat: number;
  lng: number;
  /** Manzilning tuzilgan qismlari (mavjud boʻlsa). */
  city?: string;
  street?: string;
}

interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: { city?: string; town?: string; village?: string; road?: string };
}

interface YandexResponse {
  response?: {
    GeoObjectCollection?: {
      featureMember?: {
        GeoObject?: {
          Point?: { pos?: string };
          metaDataProperty?: { GeocoderMetaData?: { text?: string } };
          name?: string;
          description?: string;
        };
      }[];
    };
  };
}

const CACHE_TTL_SECONDS = 24 * 3600;

/**
 * Manzil qidiruvi va teskari geokoding.
 *
 * Provayder tanlovi muhim: Oʻzbekiston manzillari (masalan "Chilonzor
 * 19-kvartal") OSM'da toʻliq emas. Prodda **Yandex** ishlatiladi, lokal
 * ishlab chiqishda esa kalitsiz ishlaydigan **Nominatim** yetarli.
 *
 * Ikkalasi ham bitta interfeys ortida — provayderni almashtirish uchun
 * `.env` dagi bitta qator yetarli.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly provider: 'nominatim' | 'yandex';
  private readonly nominatimUrl: string;
  private readonly yandexKey: string;
  private readonly timeoutMs: number;

  constructor(
    @Inject(ConfigService) config: ConfigService<Env, true>,
    private readonly redis: RedisService,
  ) {
    this.provider = config.get('GEOCODER_PROVIDER', { infer: true });
    this.nominatimUrl = config.get('NOMINATIM_BASE_URL', { infer: true });
    this.yandexKey = config.get('YANDEX_GEOCODER_API_KEY', { infer: true }) ?? '';
    this.timeoutMs = config.get('GEO_HTTP_TIMEOUT_MS', { infer: true });
  }

  async search(query: string, limit = 8): Promise<GeoPlace[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Qidiruv soʻzi juda qisqa');
    }

    const cacheKey = `geo:s:${this.provider}:${trimmed.toLowerCase()}:${limit}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as GeoPlace[];

    const places =
      this.provider === 'yandex'
        ? await this.yandexSearch(trimmed, limit)
        : await this.nominatimSearch(trimmed, limit);

    if (places.length > 0) {
      await this.redis.client.set(cacheKey, JSON.stringify(places), 'EX', CACHE_TTL_SECONDS);
    }
    return places;
  }

  async reverse(point: Coordinates): Promise<GeoPlace | null> {
    if (!isValidCoordinate(point)) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Koordinata notoʻgʻri');
    }

    const cacheKey = `geo:r:${this.provider}:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as GeoPlace;

    const place =
      this.provider === 'yandex'
        ? await this.yandexReverse(point)
        : await this.nominatimReverse(point);

    if (place) {
      await this.redis.client.set(cacheKey, JSON.stringify(place), 'EX', CACHE_TTL_SECONDS);
    }
    return place;
  }

  // ------------------------------------------------------------ nominatim

  private async nominatimSearch(query: string, limit: number): Promise<GeoPlace[]> {
    const url =
      `${this.nominatimUrl}/search?format=jsonv2&addressdetails=1` +
      `&countrycodes=uz&limit=${limit}&q=${encodeURIComponent(query)}`;

    const items = await this.fetchJson<NominatimItem[]>(url, true);
    if (!Array.isArray(items)) return [];

    return items
      .filter((item) => item.lat && item.lon)
      .map((item) => ({
        label: item.display_name ?? '',
        lat: Number(item.lat),
        lng: Number(item.lon),
        city: item.address?.city ?? item.address?.town ?? item.address?.village,
        street: item.address?.road,
      }));
  }

  private async nominatimReverse(point: Coordinates): Promise<GeoPlace | null> {
    const url =
      `${this.nominatimUrl}/reverse?format=jsonv2&addressdetails=1` +
      `&lat=${point.lat}&lon=${point.lng}`;

    const item = await this.fetchJson<NominatimItem>(url, true);
    if (!item?.display_name) return null;

    return {
      label: item.display_name,
      lat: point.lat,
      lng: point.lng,
      city: item.address?.city ?? item.address?.town ?? item.address?.village,
      street: item.address?.road,
    };
  }

  // --------------------------------------------------------------- yandex

  private async yandexSearch(query: string, limit: number): Promise<GeoPlace[]> {
    const url =
      `https://geocode-maps.yandex.ru/1.x/?apikey=${this.yandexKey}&format=json` +
      `&results=${limit}&geocode=${encodeURIComponent(query)}` +
      `&bbox=55.9,37.1~73.2,45.7&rspn=1`;

    const body = await this.fetchJson<YandexResponse>(url, false);
    const members = body?.response?.GeoObjectCollection?.featureMember ?? [];

    return members.flatMap((member) => {
      const object = member.GeoObject;
      const pos = object?.Point?.pos;
      if (!pos) return [];
      const [lng, lat] = pos.split(' ').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

      return [
        {
          label:
            object?.metaDataProperty?.GeocoderMetaData?.text ??
            [object?.description, object?.name].filter(Boolean).join(', '),
          lat,
          lng,
        },
      ];
    });
  }

  private async yandexReverse(point: Coordinates): Promise<GeoPlace | null> {
    const url =
      `https://geocode-maps.yandex.ru/1.x/?apikey=${this.yandexKey}&format=json` +
      `&results=1&geocode=${point.lng},${point.lat}`;

    const body = await this.fetchJson<YandexResponse>(url, false);
    const object = body?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
    const label = object?.metaDataProperty?.GeocoderMetaData?.text;
    if (!label) return null;

    return { label, lat: point.lat, lng: point.lng };
  }

  // -------------------------------------------------------------- helpers

  private async fetchJson<T>(url: string, needsUserAgent: boolean): Promise<T | null> {
    try {
      const response = await fetch(url, {
        // Nominatim User-Agent talab qiladi va busiz 403 qaytaradi
        headers: needsUserAgent
          ? { 'User-Agent': 'Karvon/0.1 (logistics platform; support@karvon.uz)' }
          : {},
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn({ status: response.status }, 'Geokoder xato javob qaytardi');
        return null;
      }
      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn({ err: error }, 'Geokoder soʻrovi bajarilmadi');
      return null;
    }
  }
}

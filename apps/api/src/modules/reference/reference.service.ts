import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';

import { DatabaseService } from '@/infra/database/database.service';
import { RedisService } from '@/infra/redis/redis.service';

export interface RegionDto {
  id: number;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  lat: number;
  lng: number;
  districts: { id: number; nameUz: string; nameRu: string; nameEn: string }[];
}

export interface ReferenceBundle {
  version: string;
  regions: RegionDto[];
  vehicleTypes: unknown[];
  bodyTypes: unknown[];
  cargoCategories: unknown[];
  specialRequirements: unknown[];
}

const CACHE_KEY = 'reference:bundle:v1';
const CACHE_TTL_SECONDS = 3600;

@Injectable()
export class ReferenceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Barcha spravochniklar bitta so'rovda.
   *
   * NEGA UCH TILNI HAM QAYTARAMIZ (bitta tilga qisqartirmasdan):
   * mobil ilova bu to'plamni bir marta yuklab, lokal saqlaydi. Foydalanuvchi
   * tilni o'zgartirsa yoki internetsiz qolsa — qayta so'rov kerak emas.
   * To'plam kichik (~40 KB), tarmoqqa yuk emas.
   *
   * Kesh: Redis'da 1 soat. Spravochnik kuniga bir marta ham o'zgarmaydi,
   * lekin har bir ilova ochilishida so'raladi — bu eng ko'p chaqiriladigan endpoint.
   */
  async getBundle(): Promise<ReferenceBundle> {
    const cached = await this.redis.client.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as ReferenceBundle;

    const bundle = await this.loadFromDatabase();
    await this.redis.client.set(CACHE_KEY, JSON.stringify(bundle), 'EX', CACHE_TTL_SECONDS);
    return bundle;
  }

  /** Admin spravochnikni o'zgartirganda chaqiriladi. */
  async invalidate(): Promise<void> {
    await this.redis.client.del(CACHE_KEY);
  }

  private async loadFromDatabase(): Promise<ReferenceBundle> {
    const db = this.database.db;

    // PostGIS nuqtasidan koordinata olish — Kysely'ning `sql` shabloni orqali.
    // Bu parametrlangan va SQL injection'dan himoyalangan.
    const regions = await db
      .selectFrom('regions')
      .select([
        'id',
        'code',
        'nameUz',
        'nameRu',
        'nameEn',
        sql<number>`ST_Y(center_geom::geometry)`.as('lat'),
        sql<number>`ST_X(center_geom::geometry)`.as('lng'),
      ])
      .orderBy('sortOrder')
      .execute();

    const districts = await db
      .selectFrom('districts')
      .select(['id', 'regionId', 'nameUz', 'nameRu', 'nameEn'])
      .orderBy('nameUz')
      .execute();

    const [vehicleTypes, bodyTypes, cargoCategories, specialRequirements] = await Promise.all([
      db
        .selectFrom('vehicleTypes')
        .select([
          'id',
          'code',
          'nameUz',
          'nameRu',
          'nameEn',
          'minCapacityKg',
          'maxCapacityKg',
          'typicalVolumeM3',
          'iconKey',
        ])
        .where('isActive', '=', true)
        .orderBy('sortOrder')
        .execute(),
      db
        .selectFrom('bodyTypes')
        .select(['id', 'code', 'nameUz', 'nameRu', 'nameEn', 'isTemperatureControlled'])
        .where('isActive', '=', true)
        .orderBy('id')
        .execute(),
      db
        .selectFrom('cargoCategories')
        .select([
          'id',
          'code',
          'nameUz',
          'nameRu',
          'nameEn',
          'requiresSpecialPermit',
          'parentId',
          'iconKey',
        ])
        .where('isActive', '=', true)
        .orderBy('id')
        .execute(),
      db
        .selectFrom('specialRequirements')
        .select(['id', 'code', 'nameUz', 'nameRu', 'nameEn', 'extraCostHintTiyin'])
        .orderBy('id')
        .execute(),
    ]);

    const byRegion = new Map<number, RegionDto['districts']>();
    for (const district of districts) {
      const list = byRegion.get(district.regionId) ?? [];
      list.push({
        id: district.id,
        nameUz: district.nameUz,
        nameRu: district.nameRu,
        nameEn: district.nameEn,
      });
      byRegion.set(district.regionId, list);
    }

    const payload = {
      regions: regions.map((region) => ({
        ...region,
        lat: Number(region.lat),
        lng: Number(region.lng),
        districts: byRegion.get(region.id) ?? [],
      })),
      vehicleTypes,
      bodyTypes,
      cargoCategories,
      specialRequirements,
    };

    // Versiya = mazmun hash'i. Mijoz shu qiymatni saqlaydi va keyingi safar
    // `?version=` bilan so'raydi — o'zgarmagan bo'lsa 304 oladi.
    const version = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 16);

    return { version, ...payload };
  }
}

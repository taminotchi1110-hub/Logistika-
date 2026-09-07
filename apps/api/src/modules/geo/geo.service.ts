import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { isValidCoordinate, isWithinUzbekistan, type Coordinates } from '@/common/utils/geo.util';
import { DatabaseService } from '@/infra/database/database.service';

export interface ResolvedRegion {
  regionId: number;
  regionCode: string;
  regionNameUz: string;
  districtId: number | null;
  districtNameUz: string | null;
}

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Nuqtani tekshiradi. Yuk eʼloni koordinatasi xato boʻlsa butun matching
   * buziladi — shuning uchun tekshiruv chegarada, ichkariga oʻtkazilmaydi.
   */
  assertUsablePoint(point: Coordinates, field: string): void {
    if (!isValidCoordinate(point)) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, `${field}: koordinata notoʻgʻri`);
    }
    if (!isWithinUzbekistan(point)) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        `${field}: nuqta Oʻzbekiston hududidan tashqarida`,
      );
    }
  }

  /**
   * Koordinatadan viloyat va tumanni aniqlaydi.
   *
   * Avval PostGIS polygon boʻyicha (aniq), polygon boʻlmasa — eng yaqin
   * markazga qarab (taxminiy). Viloyat chegaralari `regions.boundary` ga
   * yuklangach ikkinchi yoʻl oʻz-oʻzidan ishlamay qoladi.
   *
   * NEGA MUHIM: lenta va matching viloyat boʻyicha filtrlaydi. Foydalanuvchi
   * xaritadan pin qoʻysa ham yuk toʻgʻri viloyatga tushishi kerak.
   */
  async resolveRegion(point: Coordinates): Promise<ResolvedRegion> {
    const geom = sql<string>`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography`;

    const byBoundary = await sql<{
      region_id: number;
      region_code: string;
      region_name_uz: string;
    }>`
      SELECT id AS region_id, code AS region_code, name_uz AS region_name_uz
      FROM regions
      WHERE boundary IS NOT NULL AND ST_Covers(boundary, ${geom})
      LIMIT 1
    `.execute(this.database.db);

    const region =
      byBoundary.rows[0] ??
      (
        await sql<{ region_id: number; region_code: string; region_name_uz: string }>`
          SELECT id AS region_id, code AS region_code, name_uz AS region_name_uz
          FROM regions
          ORDER BY center_geom <-> ${geom}
          LIMIT 1
        `.execute(this.database.db)
      ).rows[0];

    if (!region) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Viloyatni aniqlab boʻlmadi');
    }

    const district = (
      await sql<{ district_id: number; district_name_uz: string }>`
        SELECT id AS district_id, name_uz AS district_name_uz
        FROM districts
        WHERE region_id = ${region.region_id} AND center_geom IS NOT NULL
        ORDER BY center_geom <-> ${geom}
        LIMIT 1
      `.execute(this.database.db)
    ).rows[0];

    return {
      regionId: region.region_id,
      regionCode: region.region_code,
      regionNameUz: region.region_name_uz,
      districtId: district?.district_id ?? null,
      districtNameUz: district?.district_name_uz ?? null,
    };
  }

  /** Ikki nuqta orasidagi PostGIS masofasi (metr) — dastlabki filtr uchun. */
  async straightDistanceMeters(from: Coordinates, to: Coordinates): Promise<number> {
    const result = await sql<{ meters: number }>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${from.lng}, ${from.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${to.lng}, ${to.lat}), 4326)::geography
      ) AS meters
    `.execute(this.database.db);

    return Number(result.rows[0]?.meters ?? 0);
  }
}

import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { normalizeUzPhone } from '@/common/utils/phone.util';
import { DatabaseService } from '@/infra/database/database.service';
import { GeoService } from '@/modules/geo/geo.service';

export interface SavedAddressView {
  id: string;
  label: string;
  addressText: string;
  lat: number;
  lng: number;
  regionId: number | null;
  regionName: string | null;
  districtId: number | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  useCount: number;
  createdAt: Date;
}

export interface SaveAddressInput {
  label: string;
  addressText: string;
  lat: number;
  lng: number;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}

const MAX_ADDRESSES = 50;

@Injectable()
export class AddressesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly geo: GeoService,
  ) {}

  async list(userId: string): Promise<SavedAddressView[]> {
    // `geom` — PostGIS ustuni, shuning uchun butun soʻrov xom SQL'da.
    const result = await sql<{
      id: string;
      label: string;
      address_text: string;
      lat: number;
      lng: number;
      region_id: number | null;
      region_name: string | null;
      district_id: number | null;
      contact_name: string | null;
      contact_phone: string | null;
      notes: string | null;
      use_count: number;
      created_at: Date;
    }>`
      SELECT sa.id, sa.label, sa.address_text,
             ST_Y(sa.geom::geometry) AS lat,
             ST_X(sa.geom::geometry) AS lng,
             sa.region_id, r.name_uz AS region_name, sa.district_id,
             sa.contact_name, sa.contact_phone, sa.notes, sa.use_count, sa.created_at
      FROM saved_addresses sa
      LEFT JOIN regions r ON r.id = sa.region_id
      WHERE sa.user_id = ${userId}
      ORDER BY sa.use_count DESC, sa.created_at DESC
    `.execute(this.database.db);

    return result.rows.map((row) => ({
      id: row.id,
      label: row.label,
      addressText: row.address_text,
      lat: Number(row.lat),
      lng: Number(row.lng),
      regionId: row.region_id,
      regionName: row.region_name,
      districtId: row.district_id,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      notes: row.notes,
      useCount: Number(row.use_count),
      createdAt: row.created_at,
    }));
  }

  async create(userId: string, input: SaveAddressInput): Promise<SavedAddressView> {
    this.geo.assertUsablePoint({ lat: input.lat, lng: input.lng }, 'manzil');

    const count = await this.database.db
      .selectFrom('savedAddresses')
      .select('id')
      .where('userId', '=', userId)
      .limit(MAX_ADDRESSES)
      .execute();

    if (count.length >= MAX_ADDRESSES) {
      throw AppError.conflict(
        ErrorCode.VALIDATION_FAILED,
        `Saqlangan manzillar soni ${MAX_ADDRESSES} tadan oshmasligi kerak`,
      );
    }

    const region = await this.geo.resolveRegion({ lat: input.lat, lng: input.lng });
    const phone = input.contactPhone ? this.requirePhone(input.contactPhone) : null;

    const inserted = await sql<{ id: string }>`
      INSERT INTO saved_addresses
        (user_id, label, address_text, region_id, district_id, geom,
         contact_name, contact_phone, notes)
      VALUES (
        ${userId}, ${input.label.trim()}, ${input.addressText.trim()},
        ${region.regionId}, ${region.districtId},
        ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
        ${input.contactName?.trim() ?? null}, ${phone}, ${input.notes?.trim() ?? null}
      )
      RETURNING id
    `.execute(this.database.db);

    const id = inserted.rows[0]?.id;
    const created = (await this.list(userId)).find((item) => item.id === id);
    if (!created) throw AppError.notFound('Manzil saqlanmadi');
    return created;
  }

  async remove(userId: string, addressId: string): Promise<void> {
    const deleted = await this.database.db
      .deleteFrom('savedAddresses')
      .where('id', '=', addressId)
      .where('userId', '=', userId)
      .returning('id')
      .executeTakeFirst();

    if (!deleted) throw AppError.notFound('Manzil topilmadi');
  }

  /** Manzil ishlatilganda hisoblagichni oshiradi — roʻyxat foydalilik boʻyicha saralanadi. */
  async markUsed(userId: string, addressId: string): Promise<void> {
    await this.database.db
      .updateTable('savedAddresses')
      .set((eb) => ({ useCount: eb('useCount', '+', 1) }))
      .where('id', '=', addressId)
      .where('userId', '=', userId)
      .execute();
  }

  private requirePhone(input: string): string {
    const phone = normalizeUzPhone(input);
    if (!phone) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Kontakt telefoni notoʻgʻri');
    }
    return phone;
  }
}

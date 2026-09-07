import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { formatPlate, normalizePlate } from '@/common/utils/plate.util';
import { DatabaseService } from '@/infra/database/database.service';
import type { Vehicle } from '@/infra/database/database.types';

import type { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';

export interface VehicleView {
  id: string;
  vehicleTypeId: number;
  vehicleTypeName: string;
  bodyTypeId: number;
  bodyTypeName: string;
  brand: string;
  model: string;
  year: number | null;
  plateNumber: string;
  plateFormatted: string;
  color: string | null;
  capacityKg: number;
  volumeM3: number;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  hasTrailer: boolean;
  trailerCapacityKg: number | null;
  totalCapacityKg: number;
  hasHydroBoard: boolean;
  hasRamp: boolean;
  tempMinC: number | null;
  tempMaxC: number | null;
  adrCertified: boolean;
  insuranceExpiresAt: Date | null;
  inspectionExpiresAt: Date | null;
  verificationStatus: string;
  isActive: boolean;
  isPrimary: boolean;
  /** Sugʻurta yoki texko'rik muddati 30 kundan kam qolgan boʻlsa. */
  warnings: string[];
  createdAt: Date;
}

const MAX_VEHICLES_PER_DRIVER = 20;
const EXPIRY_WARNING_DAYS = 30;

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private readonly database: DatabaseService) {}

  async create(driverId: string, dto: CreateVehicleDto): Promise<VehicleView> {
    const plate = this.requireValidPlate(dto.plateNumber);
    await this.assertCanAddMore(driverId);
    await this.assertPlateIsFree(plate, null);
    await this.validateAgainstReference(dto);

    const isFirst =
      (await this.database.db
        .selectFrom('vehicles')
        .select('id')
        .where('driverId', '=', driverId)
        .where('deletedAt', 'is', null)
        .executeTakeFirst()) === undefined;

    const created = await this.database.db
      .insertInto('vehicles')
      .values({
        driverId,
        vehicleTypeId: dto.vehicleTypeId,
        bodyTypeId: dto.bodyTypeId,
        brand: dto.brand.trim(),
        model: dto.model.trim(),
        year: dto.year ?? null,
        plateNumber: plate,
        color: dto.color?.trim() ?? null,
        capacityKg: dto.capacityKg,
        volumeM3: String(dto.volumeM3),
        lengthM: dto.lengthM === undefined ? null : String(dto.lengthM),
        widthM: dto.widthM === undefined ? null : String(dto.widthM),
        heightM: dto.heightM === undefined ? null : String(dto.heightM),
        hasTrailer: dto.hasTrailer ?? false,
        trailerCapacityKg: dto.trailerCapacityKg ?? null,
        trailerVolumeM3: dto.trailerVolumeM3 === undefined ? null : String(dto.trailerVolumeM3),
        hasHydroBoard: dto.hasHydroBoard ?? false,
        hasRamp: dto.hasRamp ?? false,
        tempMinC: dto.tempMinC ?? null,
        tempMaxC: dto.tempMaxC ?? null,
        adrCertified: dto.adrCertified ?? false,
        insuranceExpiresAt: dto.insuranceExpiresAt ?? null,
        inspectionExpiresAt: dto.inspectionExpiresAt ?? null,
        // Birinchi transport avtomatik asosiy boʻladi — foydalanuvchi
        // qoʻshimcha bir tegishdan qutuladi
        isPrimary: isFirst,
        verificationStatus: 'NOT_SUBMITTED',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    this.logger.log({ vehicleId: created.id, driverId }, 'Transport qoʻshildi');
    return this.toView(created);
  }

  async list(driverId: string): Promise<VehicleView[]> {
    const rows = await this.database.db
      .selectFrom('vehicles')
      .selectAll()
      .where('driverId', '=', driverId)
      .where('deletedAt', 'is', null)
      .orderBy('isPrimary', 'desc')
      .orderBy('createdAt', 'desc')
      .execute();

    return Promise.all(rows.map((row) => this.toView(row)));
  }

  async getOwned(driverId: string, vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.database.db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', '=', vehicleId)
      .where('driverId', '=', driverId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    // Begona transport ham 404 — 403 uning mavjudligini oshkor qilardi
    if (!vehicle) throw AppError.notFound('Transport topilmadi');
    return vehicle;
  }

  async getById(driverId: string, vehicleId: string): Promise<VehicleView> {
    return this.toView(await this.getOwned(driverId, vehicleId));
  }

  async update(driverId: string, vehicleId: string, dto: UpdateVehicleDto): Promise<VehicleView> {
    const existing = await this.getOwned(driverId, vehicleId);

    if (existing.verificationStatus === 'VERIFIED' && this.touchesVerifiedFields(dto)) {
      // Texnik parametrlar matching’ga bevosita taʼsir qiladi. Tasdiqlangan
      // transportda ularni jimgina oʻzgartirish — firibgarlik yoʻli
      // (5 t deb tasdiqlatib, keyin 20 t qilib qoʻyish).
      throw AppError.conflict(
        ErrorCode.VALIDATION_FAILED,
        'Tasdiqlangan transportning texnik parametrlarini oʻzgartirib boʻlmaydi. Qoʻllab-quvvatlashga murojaat qiling.',
        { lockedFields: ['vehicleTypeId', 'bodyTypeId', 'plateNumber', 'capacityKg', 'volumeM3'] },
      );
    }

    const plate = dto.plateNumber ? this.requireValidPlate(dto.plateNumber) : undefined;
    if (plate) await this.assertPlateIsFree(plate, vehicleId);

    await this.validateAgainstReference({
      vehicleTypeId: dto.vehicleTypeId ?? existing.vehicleTypeId,
      bodyTypeId: dto.bodyTypeId ?? existing.bodyTypeId,
      capacityKg: dto.capacityKg ?? existing.capacityKg,
      volumeM3: dto.volumeM3 ?? Number(existing.volumeM3),
      hasTrailer: dto.hasTrailer ?? existing.hasTrailer,
      trailerCapacityKg: dto.trailerCapacityKg ?? existing.trailerCapacityKg ?? undefined,
      tempMinC: dto.tempMinC ?? existing.tempMinC ?? undefined,
      tempMaxC: dto.tempMaxC ?? existing.tempMaxC ?? undefined,
    });

    const updated = await this.database.db
      .updateTable('vehicles')
      .set({
        vehicleTypeId: dto.vehicleTypeId,
        bodyTypeId: dto.bodyTypeId,
        brand: dto.brand?.trim(),
        model: dto.model?.trim(),
        year: dto.year,
        plateNumber: plate,
        color: dto.color?.trim(),
        capacityKg: dto.capacityKg,
        volumeM3: dto.volumeM3 === undefined ? undefined : String(dto.volumeM3),
        lengthM: dto.lengthM === undefined ? undefined : String(dto.lengthM),
        widthM: dto.widthM === undefined ? undefined : String(dto.widthM),
        heightM: dto.heightM === undefined ? undefined : String(dto.heightM),
        hasTrailer: dto.hasTrailer,
        trailerCapacityKg: dto.trailerCapacityKg,
        trailerVolumeM3:
          dto.trailerVolumeM3 === undefined ? undefined : String(dto.trailerVolumeM3),
        hasHydroBoard: dto.hasHydroBoard,
        hasRamp: dto.hasRamp,
        tempMinC: dto.tempMinC,
        tempMaxC: dto.tempMaxC,
        adrCertified: dto.adrCertified,
        insuranceExpiresAt: dto.insuranceExpiresAt,
        inspectionExpiresAt: dto.inspectionExpiresAt,
        // Texnik parametr oʻzgarsa verifikatsiya qaytadan boshlanadi
        verificationStatus: this.touchesVerifiedFields(dto) ? 'NOT_SUBMITTED' : undefined,
      })
      .where('id', '=', vehicleId)
      .where('driverId', '=', driverId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.toView(updated);
  }

  async setPrimary(driverId: string, vehicleId: string): Promise<VehicleView> {
    await this.getOwned(driverId, vehicleId);

    const updated = await this.database.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('vehicles')
        .set({ isPrimary: false })
        .where('driverId', '=', driverId)
        .execute();

      return trx
        .updateTable('vehicles')
        .set({ isPrimary: true })
        .where('id', '=', vehicleId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    return this.toView(updated);
  }

  async remove(driverId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.getOwned(driverId, vehicleId);

    await this.database.db
      .updateTable('vehicles')
      .set({ deletedAt: new Date(), isActive: false, isPrimary: false })
      .where('id', '=', vehicleId)
      .execute();

    // Asosiy transport oʻchirilsa, qolganidan biri asosiy boʻladi —
    // "asosiy transporti yoʻq haydovchi" holati yuzaga kelmasin
    if (vehicle.isPrimary) {
      const next = await this.database.db
        .selectFrom('vehicles')
        .select('id')
        .where('driverId', '=', driverId)
        .where('deletedAt', 'is', null)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst();

      if (next) {
        await this.database.db
          .updateTable('vehicles')
          .set({ isPrimary: true })
          .where('id', '=', next.id)
          .execute();
      }
    }
  }

  /** Haydovchida kamida bitta tasdiqlangan va faol transport bormi. */
  async hasUsableVehicle(driverId: string): Promise<boolean> {
    const row = await this.database.db
      .selectFrom('vehicles')
      .select('id')
      .where('driverId', '=', driverId)
      .where('deletedAt', 'is', null)
      .where('isActive', '=', true)
      .where('verificationStatus', '=', 'VERIFIED')
      .executeTakeFirst();

    return Boolean(row);
  }

  // ------------------------------------------------------------------ ichki

  private requireValidPlate(input: string): string {
    const plate = normalizePlate(input);
    if (!plate) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Davlat raqami notoʻgʻri. Namuna: 01 A 123 BC',
      );
    }
    return plate;
  }

  private async assertPlateIsFree(plate: string, exceptVehicleId: string | null): Promise<void> {
    let query = this.database.db
      .selectFrom('vehicles')
      .select('id')
      .where('plateNumber', '=', plate)
      .where('deletedAt', 'is', null);

    if (exceptVehicleId) query = query.where('id', '!=', exceptVehicleId);

    if (await query.executeTakeFirst()) {
      // Kimga tegishli ekanini aytmaymiz — bu boshqa foydalanuvchi haqidagi maʼlumot
      throw AppError.conflict(
        ErrorCode.VALIDATION_FAILED,
        'Bu davlat raqami tizimda allaqachon roʻyxatdan oʻtgan',
      );
    }
  }

  private async assertCanAddMore(driverId: string): Promise<void> {
    const rows = await this.database.db
      .selectFrom('vehicles')
      .select('id')
      .where('driverId', '=', driverId)
      .where('deletedAt', 'is', null)
      .limit(MAX_VEHICLES_PER_DRIVER)
      .execute();

    if (rows.length >= MAX_VEHICLES_PER_DRIVER) {
      throw AppError.conflict(
        ErrorCode.VALIDATION_FAILED,
        `Bitta akkauntda ${MAX_VEHICLES_PER_DRIVER} tadan koʻp transport boʻlishi mumkin emas. Park uchun korporativ akkaunt oching.`,
      );
    }
  }

  /**
   * Kiritilgan parametrlar spravochnikka mos kelishini tekshiradi.
   * Bu shunchaki "chiroyli maʼlumot" uchun emas: matching quvvat va hajm
   * boʻyicha filtrlaydi, notoʻgʻri qiymat esa yukni mos boʻlmagan mashinaga
   * yuborib qoʻyadi.
   */
  private async validateAgainstReference(input: {
    vehicleTypeId: number;
    bodyTypeId: number;
    capacityKg: number;
    volumeM3: number;
    hasTrailer?: boolean;
    trailerCapacityKg?: number;
    tempMinC?: number;
    tempMaxC?: number;
  }): Promise<void> {
    const [vehicleType, bodyType] = await Promise.all([
      this.database.db
        .selectFrom('vehicleTypes')
        .select(['nameUz', 'minCapacityKg', 'maxCapacityKg'])
        .where('id', '=', input.vehicleTypeId)
        .where('isActive', '=', true)
        .executeTakeFirst(),
      this.database.db
        .selectFrom('bodyTypes')
        .select(['nameUz', 'isTemperatureControlled'])
        .where('id', '=', input.bodyTypeId)
        .where('isActive', '=', true)
        .executeTakeFirst(),
    ]);

    if (!vehicleType) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Transport turi topilmadi');
    }
    if (!bodyType) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Kuzov turi topilmadi');
    }

    // Chegaradan 30% chetlanishga ruxsat: modifikatsiyalar bor, lekin
    // "Damas — 20 tonna" kabi qiymat oʻtmasligi kerak
    const minAllowed = Math.floor(vehicleType.minCapacityKg * 0.7);
    const maxAllowed = Math.ceil(vehicleType.maxCapacityKg * 1.3);

    if (input.capacityKg < minAllowed || input.capacityKg > maxAllowed) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        `${vehicleType.nameUz} uchun quvvat ${minAllowed}–${maxAllowed} kg oraligʻida boʻlishi kerak`,
        { min: minAllowed, max: maxAllowed, provided: input.capacityKg },
      );
    }

    if (input.tempMinC !== undefined && input.tempMaxC !== undefined) {
      if (input.tempMinC > input.tempMaxC) {
        throw AppError.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'Minimal harorat maksimaldan katta boʻlishi mumkin emas',
        );
      }
      if (!bodyType.isTemperatureControlled) {
        throw AppError.badRequest(
          ErrorCode.VALIDATION_FAILED,
          `${bodyType.nameUz} kuzovida harorat rejimi boʻlmaydi. Refrijerator yoki izotermik tanlang.`,
        );
      }
    }

    if (input.trailerCapacityKg !== undefined && !input.hasTrailer) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Tirkama parametrlari koʻrsatilgan, lekin hasTrailer=false',
      );
    }
  }

  private touchesVerifiedFields(dto: UpdateVehicleDto): boolean {
    return (
      dto.vehicleTypeId !== undefined ||
      dto.bodyTypeId !== undefined ||
      dto.plateNumber !== undefined ||
      dto.capacityKg !== undefined ||
      dto.volumeM3 !== undefined
    );
  }

  private async toView(vehicle: Vehicle): Promise<VehicleView> {
    const [vehicleType, bodyType] = await Promise.all([
      this.database.db
        .selectFrom('vehicleTypes')
        .select('nameUz')
        .where('id', '=', vehicle.vehicleTypeId)
        .executeTakeFirst(),
      this.database.db
        .selectFrom('bodyTypes')
        .select('nameUz')
        .where('id', '=', vehicle.bodyTypeId)
        .executeTakeFirst(),
    ]);

    return {
      id: vehicle.id,
      vehicleTypeId: vehicle.vehicleTypeId,
      vehicleTypeName: vehicleType?.nameUz ?? '',
      bodyTypeId: vehicle.bodyTypeId,
      bodyTypeName: bodyType?.nameUz ?? '',
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      plateNumber: vehicle.plateNumber,
      plateFormatted: formatPlate(vehicle.plateNumber),
      color: vehicle.color,
      capacityKg: vehicle.capacityKg,
      volumeM3: Number(vehicle.volumeM3),
      lengthM: vehicle.lengthM === null ? null : Number(vehicle.lengthM),
      widthM: vehicle.widthM === null ? null : Number(vehicle.widthM),
      heightM: vehicle.heightM === null ? null : Number(vehicle.heightM),
      hasTrailer: vehicle.hasTrailer,
      trailerCapacityKg: vehicle.trailerCapacityKg,
      totalCapacityKg: vehicle.capacityKg + (vehicle.trailerCapacityKg ?? 0),
      hasHydroBoard: vehicle.hasHydroBoard,
      hasRamp: vehicle.hasRamp,
      tempMinC: vehicle.tempMinC,
      tempMaxC: vehicle.tempMaxC,
      adrCertified: vehicle.adrCertified,
      insuranceExpiresAt: vehicle.insuranceExpiresAt,
      inspectionExpiresAt: vehicle.inspectionExpiresAt,
      verificationStatus: vehicle.verificationStatus,
      isActive: vehicle.isActive,
      isPrimary: vehicle.isPrimary,
      warnings: this.buildWarnings(vehicle),
      createdAt: vehicle.createdAt,
    };
  }

  /** Muddati tugayotgan hujjatlar — haydovchi yoʻlda ushlanib qolmasin. */
  private buildWarnings(vehicle: Vehicle): string[] {
    const warnings: string[] = [];
    const threshold = Date.now() + EXPIRY_WARNING_DAYS * 24 * 3600 * 1000;

    if (vehicle.insuranceExpiresAt) {
      const at = new Date(vehicle.insuranceExpiresAt).getTime();
      if (at < Date.now()) warnings.push('INSURANCE_EXPIRED');
      else if (at < threshold) warnings.push('INSURANCE_EXPIRING_SOON');
    }
    if (vehicle.inspectionExpiresAt) {
      const at = new Date(vehicle.inspectionExpiresAt).getTime();
      if (at < Date.now()) warnings.push('INSPECTION_EXPIRED');
      else if (at < threshold) warnings.push('INSPECTION_EXPIRING_SOON');
    }
    return warnings;
  }
}

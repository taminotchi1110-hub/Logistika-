import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { isValidCoordinate, type Coordinates } from '@/common/utils/geo.util';
import { DatabaseService } from '@/infra/database/database.service';
import type { DriverAvailability } from '@/infra/database/database.types';
import { DocumentsService } from '@/modules/documents/documents.service';
import { VehiclesService } from '@/modules/vehicles/vehicles.service';

export interface DriverRouteView {
  id: string;
  fromRegionId: number;
  fromRegionName: string;
  toRegionId: number | null;
  toRegionName: string | null;
  isRegular: boolean;
  priority: number;
}

export interface DriverReadiness {
  profileComplete: boolean;
  hasIdentity: boolean;
  hasLicense: boolean;
  hasVerifiedVehicle: boolean;
  hasRoutes: boolean;
  verificationStatus: string;
  /** Haydovchi taklif yubora oladimi — barcha shartlar bajarilganmi. */
  canSendOffers: boolean;
  /** Qolgan qadamlar — mobil ilova shu roʻyxatni koʻrsatadi. */
  missingSteps: string[];
}

const MAX_ROUTES = 30;

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly documents: DocumentsService,
    private readonly vehicles: VehiclesService,
  ) {}

  // ------------------------------------------------------------- holat

  /**
   * Boʻsh / band / oflayn holati.
   *
   * `AVAILABLE` — matching shu haydovchini koʻradi. Shuning uchun oʻtishdan
   * oldin hujjat va transport tekshiriladi: tasdiqlanmagan haydovchi lentada
   * "boʻsh" boʻlib turishi mumkin emas.
   */
  async setAvailability(driverId: string, availability: DriverAvailability) {
    if (availability === 'AVAILABLE') {
      const readiness = await this.getReadiness(driverId);
      if (!readiness.canSendOffers) {
        throw AppError.unprocessable(
          ErrorCode.DRIVER_NOT_VERIFIED,
          'Boʻsh holatga oʻtish uchun avval verifikatsiyani yakunlang',
          { missingSteps: readiness.missingSteps },
        );
      }
    }

    const updated = await this.database.db
      .updateTable('driverProfiles')
      .set({ availability })
      .where('userId', '=', driverId)
      .returning(['availability'])
      .executeTakeFirst();

    if (!updated) throw AppError.notFound('Haydovchi profili topilmadi');

    this.logger.log({ driverId, availability }, 'Haydovchi holati oʻzgardi');
    return { availability: updated.availability };
  }

  /**
   * Joriy joylashuvni yangilaydi (past chastotali, boʻsh holatdagi haydovchi uchun).
   * Faol buyurtma vaqtidagi yuqori chastotali kuzatuv 4-bosqichda —
   * u WebSocket orqali ketadi va bu endpointdan foydalanmaydi.
   */
  async updateLocation(driverId: string, point: Coordinates): Promise<void> {
    if (!isValidCoordinate(point)) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Koordinata notoʻgʻri');
    }

    await sql`
      UPDATE driver_profiles
      SET current_geom = ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
          current_geom_at = now()
      WHERE user_id = ${driverId}
    `.execute(this.database.db);
  }

  // ------------------------------------------------------- yoʻnalishlar

  async listRoutes(driverId: string): Promise<DriverRouteView[]> {
    const rows = await this.database.db
      .selectFrom('driverRoutes as dr')
      .innerJoin('regions as rf', 'rf.id', 'dr.fromRegionId')
      .leftJoin('regions as rt', 'rt.id', 'dr.toRegionId')
      .select([
        'dr.id',
        'dr.fromRegionId',
        'rf.nameUz as fromRegionName',
        'dr.toRegionId',
        'rt.nameUz as toRegionName',
        'dr.isRegular',
        'dr.priority',
      ])
      .where('dr.driverId', '=', driverId)
      .orderBy('dr.priority', 'desc')
      .orderBy('dr.id')
      .execute();

    return rows.map((row) => ({ ...row, toRegionName: row.toRegionName ?? null }));
  }

  async addRoute(
    driverId: string,
    input: { fromRegionId: number; toRegionId?: number; isRegular?: boolean; priority?: number },
  ): Promise<DriverRouteView[]> {
    const existing = await this.database.db
      .selectFrom('driverRoutes')
      .select('id')
      .where('driverId', '=', driverId)
      .limit(MAX_ROUTES)
      .execute();

    if (existing.length >= MAX_ROUTES) {
      throw AppError.conflict(
        ErrorCode.VALIDATION_FAILED,
        `Yoʻnalishlar soni ${MAX_ROUTES} tadan oshmasligi kerak`,
      );
    }

    if (input.toRegionId !== undefined && input.toRegionId === input.fromRegionId) {
      // Viloyat ichida ishlash uchun `toRegionId` ni umuman yubormaslik kerak
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Boshlanish va tugash viloyati bir xil. Viloyat ichida ishlash uchun toRegionId ni yubormang.',
      );
    }

    await this.assertRegionsExist([input.fromRegionId, input.toRegionId]);

    // DIQQAT: `UNIQUE (driver_id, from_region_id, to_region_id)` indeksi
    // `to_region_id IS NULL` holatida ishlamaydi — Postgres NULL'larni bir-biriga
    // teng deb hisoblamaydi. Shuning uchun mavjudligini oʻzimiz tekshiramiz,
    // aks holda "istalgan joyga" yoʻnalishi takrorlanib ketardi.
    const baseQuery = this.database.db
      .selectFrom('driverRoutes')
      .select('id')
      .where('driverId', '=', driverId)
      .where('fromRegionId', '=', input.fromRegionId);

    const duplicate = await (
      input.toRegionId === undefined
        ? baseQuery.where('toRegionId', 'is', null)
        : baseQuery.where('toRegionId', '=', input.toRegionId)
    ).executeTakeFirst();

    if (duplicate) {
      await this.database.db
        .updateTable('driverRoutes')
        .set({ isRegular: input.isRegular ?? false, priority: input.priority ?? 0 })
        .where('id', '=', duplicate.id)
        .execute();
    } else {
      await this.database.db
        .insertInto('driverRoutes')
        .values({
          driverId,
          fromRegionId: input.fromRegionId,
          toRegionId: input.toRegionId ?? null,
          isRegular: input.isRegular ?? false,
          priority: input.priority ?? 0,
        })
        .execute();
    }

    return this.listRoutes(driverId);
  }

  async removeRoute(driverId: string, routeId: string): Promise<void> {
    const deleted = await this.database.db
      .deleteFrom('driverRoutes')
      .where('id', '=', routeId)
      .where('driverId', '=', driverId)
      .returning('id')
      .executeTakeFirst();

    if (!deleted) throw AppError.notFound('Yoʻnalish topilmadi');
  }

  // --------------------------------------------------------- tayyorlik

  /**
   * Verifikatsiya qadamlarining yagona manbai.
   *
   * Bu mantiq bitta joyda turishi shart: mobil ilova ham, `setAvailability`
   * ham, keyinchalik offer yuborish ham aynan shu javobga tayanadi. Aks holda
   * "ilovada tugma faol, lekin server rad etadi" holati chiqadi.
   */
  async getReadiness(driverId: string): Promise<DriverReadiness> {
    const [user, profile, documents, hasVerifiedVehicle, routes] = await Promise.all([
      this.database.db
        .selectFrom('users')
        .select(['firstName', 'lastName'])
        .where('id', '=', driverId)
        .executeTakeFirst(),
      this.database.db
        .selectFrom('driverProfiles')
        .select(['verificationStatus'])
        .where('userId', '=', driverId)
        .executeTakeFirst(),
      this.documents.getDriverDocumentReadiness(driverId),
      this.vehicles.hasUsableVehicle(driverId),
      this.database.db
        .selectFrom('driverRoutes')
        .select('id')
        .where('driverId', '=', driverId)
        .executeTakeFirst(),
    ]);

    if (!profile) throw AppError.notFound('Haydovchi profili topilmadi');

    const profileComplete = Boolean(user?.firstName && user?.lastName);
    const hasRoutes = Boolean(routes);

    const missingSteps: string[] = [];
    if (!profileComplete) missingSteps.push('PROFILE');
    if (!documents.hasIdentity) missingSteps.push('IDENTITY_DOCUMENT');
    if (!documents.hasLicense) missingSteps.push('DRIVER_LICENSE');
    if (!hasVerifiedVehicle) missingSteps.push('VERIFIED_VEHICLE');
    if (!hasRoutes) missingSteps.push('ROUTES');

    return {
      profileComplete,
      hasIdentity: documents.hasIdentity,
      hasLicense: documents.hasLicense,
      hasVerifiedVehicle,
      hasRoutes,
      verificationStatus: profile.verificationStatus,
      canSendOffers: missingSteps.length === 0 && profile.verificationStatus === 'VERIFIED',
      missingSteps,
    };
  }

  /** Hujjatlar toʻliq boʻlsa profilni admin navbatiga qoʻyadi. */
  async submitForVerification(driverId: string): Promise<DriverReadiness> {
    const readiness = await this.getReadiness(driverId);

    if (!readiness.profileComplete || !readiness.hasRoutes) {
      throw AppError.unprocessable(
        ErrorCode.USER_PROFILE_INCOMPLETE,
        'Avval profil va yoʻnalishlarni toʻldiring',
        { missingSteps: readiness.missingSteps },
      );
    }

    await this.database.db
      .updateTable('driverProfiles')
      .set({ verificationStatus: 'PENDING', rejectionReason: null })
      .where('userId', '=', driverId)
      .where('verificationStatus', 'in', ['NOT_SUBMITTED', 'REJECTED'])
      .execute();

    return this.getReadiness(driverId);
  }

  private async assertRegionsExist(ids: (number | undefined)[]): Promise<void> {
    const wanted = ids.filter((id): id is number => typeof id === 'number');
    if (wanted.length === 0) return;

    const found = await this.database.db
      .selectFrom('regions')
      .select('id')
      .where('id', 'in', wanted)
      .execute();

    if (found.length !== new Set(wanted).size) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Viloyat topilmadi');
    }
  }
}

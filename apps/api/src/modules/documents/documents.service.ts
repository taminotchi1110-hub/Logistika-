import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { DatabaseService } from '@/infra/database/database.service';
import type { DocumentRow, DocumentType, OwnerType } from '@/infra/database/database.types';
import { StorageService } from '@/infra/storage/storage.service';

export interface CreateDocumentInput {
  ownerType: OwnerType;
  ownerId: string;
  type: DocumentType;
  fileKey: string;
  fileName?: string;
  pageSide?: 'FRONT' | 'BACK';
  expiresAt?: string;
}

export interface DocumentView {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  type: DocumentType;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  pageSide: string | null;
  verificationStatus: string;
  rejectionReason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  /** Qisqa muddatli havola — javob berilayotgan paytda generatsiya qilinadi. */
  url: string;
}

/** Qaysi hujjat turi qaysi obyektga tegishli boʻlishi mumkin. */
const ALLOWED_TYPES_BY_OWNER: Record<OwnerType, DocumentType[]> = {
  USER: ['PASSPORT', 'ID_CARD', 'OTHER'],
  DRIVER: ['DRIVER_LICENSE', 'PASSPORT', 'ID_CARD', 'OTHER'],
  VEHICLE: ['VEHICLE_REG', 'INSURANCE', 'OTHER'],
  LOAD: ['CARGO_DOC', 'WAYBILL', 'OTHER'],
  ORDER: ['CONTRACT', 'POD', 'POP', 'SIGNATURE', 'WAYBILL', 'OTHER'],
  COMPANY: ['CONTRACT', 'OTHER'],
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Yuklangan faylni hujjat sifatida qayd etadi.
   *
   * MUHIM: mijoz "yukladim" deganiga ishonmaymiz — S3 dan `HEAD` soʻraymiz.
   * Aks holda bazada mavjud boʻlmagan faylga havola qilingan hujjatlar
   * toʻplanadi va admin verifikatsiya navbatida "fayl ochilmayapti" chiqadi.
   */
  async create(userId: string, input: CreateDocumentInput): Promise<DocumentView> {
    const allowed = ALLOWED_TYPES_BY_OWNER[input.ownerType];
    if (!allowed.includes(input.type)) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        `${input.ownerType} uchun ${input.type} turidagi hujjat mumkin emas`,
        { allowed },
      );
    }

    await this.assertOwnership(userId, input.ownerType, input.ownerId);

    if (!input.fileKey.includes(`/${userId}/`)) {
      throw AppError.badRequest(ErrorCode.FILE_KEY_NOT_OWNED, 'Fayl kaliti sizga tegishli emas');
    }

    const metadata = await this.storage.getMetadata(input.fileKey);
    if (!metadata) {
      throw AppError.badRequest(
        ErrorCode.FILE_NOT_UPLOADED,
        'Fayl storage’da topilmadi. Avval uploadUrl orqali yuklang.',
      );
    }

    const created = await this.database.db
      .insertInto('documents')
      .values({
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        type: input.type,
        fileKey: input.fileKey,
        fileName: input.fileName ?? null,
        mimeType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
        checksumSha256: metadata.checksumSha256,
        pageSide: input.pageSide ?? null,
        expiresAt: input.expiresAt ?? null,
        uploadedBy: userId,
        verificationStatus: 'PENDING',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    this.logger.log(
      { documentId: created.id, ownerType: input.ownerType, type: input.type },
      'Hujjat qoʻshildi',
    );

    return this.toView(created);
  }

  async listByOwner(
    userId: string,
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<DocumentView[]> {
    await this.assertOwnership(userId, ownerType, ownerId);

    const rows = await this.database.db
      .selectFrom('documents')
      .selectAll()
      .where('ownerType', '=', ownerType)
      .where('ownerId', '=', ownerId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute();

    return Promise.all(rows.map((row) => this.toView(row)));
  }

  /** Foydalanuvchining barcha hujjatlari: oʻzi + transportlari. */
  async listMine(userId: string): Promise<DocumentView[]> {
    const vehicleIds = (
      await this.database.db
        .selectFrom('vehicles')
        .select('id')
        .where('driverId', '=', userId)
        .where('deletedAt', 'is', null)
        .execute()
    ).map((row) => row.id);

    const rows = await this.database.db
      .selectFrom('documents')
      .selectAll()
      .where('deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb.and([
            eb('ownerType', 'in', ['USER', 'DRIVER'] as OwnerType[]),
            eb('ownerId', '=', userId),
          ]),
          ...(vehicleIds.length > 0
            ? [eb.and([eb('ownerType', '=', 'VEHICLE'), eb('ownerId', 'in', vehicleIds)])]
            : []),
        ]),
      )
      .orderBy('createdAt', 'desc')
      .execute();

    return Promise.all(rows.map((row) => this.toView(row)));
  }

  async remove(userId: string, documentId: string): Promise<void> {
    const document = await this.database.db
      .selectFrom('documents')
      .selectAll()
      .where('id', '=', documentId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!document) throw AppError.notFound('Hujjat topilmadi');

    await this.assertOwnership(userId, document.ownerType, document.ownerId);

    if (document.verificationStatus === 'VERIFIED') {
      throw AppError.conflict(
        ErrorCode.FILE_DELETE_FORBIDDEN,
        'Tasdiqlangan hujjatni oʻchirib boʻlmaydi. Qoʻllab-quvvatlash xizmatiga murojaat qiling.',
      );
    }

    // Soft delete: fayl S3 da qoladi. Nizo yoki tekshiruv chiqsa dalil kerak
    // boʻlishi mumkin; haqiqiy oʻchirish saqlash muddati tugagach, job orqali.
    await this.database.db
      .updateTable('documents')
      .set({ deletedAt: new Date() })
      .where('id', '=', documentId)
      .execute();
  }

  /**
   * Haydovchi verifikatsiyaga tayyormi: pasport/ID va guvohnoma tasdiqlanganmi.
   * Bu qoida bir joyda turadi — matching ham, offer yuborish ham shunga tayanadi.
   */
  async getDriverDocumentReadiness(userId: string): Promise<{
    hasIdentity: boolean;
    hasLicense: boolean;
    pendingCount: number;
    rejectedCount: number;
  }> {
    const rows = await this.database.db
      .selectFrom('documents')
      .select(['type', 'verificationStatus'])
      .where('ownerType', 'in', ['USER', 'DRIVER'] as OwnerType[])
      .where('ownerId', '=', userId)
      .where('deletedAt', 'is', null)
      .execute();

    return {
      hasIdentity: rows.some(
        (row) =>
          (row.type === 'PASSPORT' || row.type === 'ID_CARD') &&
          row.verificationStatus === 'VERIFIED',
      ),
      hasLicense: rows.some(
        (row) => row.type === 'DRIVER_LICENSE' && row.verificationStatus === 'VERIFIED',
      ),
      pendingCount: rows.filter((row) => row.verificationStatus === 'PENDING').length,
      rejectedCount: rows.filter((row) => row.verificationStatus === 'REJECTED').length,
    };
  }

  // ------------------------------------------------------------------ ichki

  private async assertOwnership(
    userId: string,
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<void> {
    if (ownerType === 'USER' || ownerType === 'DRIVER') {
      if (ownerId !== userId) throw AppError.notFound('Obyekt topilmadi');
      return;
    }

    if (ownerType === 'VEHICLE') {
      const vehicle = await this.database.db
        .selectFrom('vehicles')
        .select('id')
        .where('id', '=', ownerId)
        .where('driverId', '=', userId)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (!vehicle) throw AppError.notFound('Transport topilmadi');
      return;
    }

    if (ownerType === 'LOAD') {
      const load = await this.database.db
        .selectFrom('loads')
        .select('id')
        .where('id', '=', ownerId)
        .where('shipperId', '=', userId)
        .executeTakeFirst();
      if (!load) throw AppError.notFound('Yuk topilmadi');
      return;
    }

    // ORDER va COMPANY keyingi bosqichlarda ochiladi
    throw AppError.badRequest(
      ErrorCode.VALIDATION_FAILED,
      `${ownerType} uchun hujjat yuklash hali qoʻllab-quvvatlanmaydi`,
    );
  }

  private async toView(row: DocumentRow): Promise<DocumentView> {
    return {
      id: row.id,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      type: row.type,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      pageSide: row.pageSide,
      verificationStatus: row.verificationStatus,
      rejectionReason: row.rejectionReason,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      url: await this.storage.createDownloadUrl(row.fileKey, row.fileName ?? undefined),
    };
  }
}

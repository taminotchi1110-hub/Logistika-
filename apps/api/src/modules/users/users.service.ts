import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { DatabaseService } from '@/infra/database/database.service';
import type { LangCode, User, UserRole, UserUpdate } from '@/infra/database/database.types';

export interface PublicUserProfile {
  id: string;
  phone: string;
  role: UserRole;
  status: string;
  firstName: string | null;
  lastName: string | null;
  avatarKey: string | null;
  lang: LangCode;
  ratingAvg: number;
  ratingCount: number;
  completedOrders: number;
  isProfileComplete: boolean;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly database: DatabaseService) {}

  async findByPhone(phone: string): Promise<User | undefined> {
    return this.database.db
      .selectFrom('users')
      .selectAll()
      .where('phone', '=', phone)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findById(id: string): Promise<User | undefined> {
    return this.database.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async getByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw AppError.notFound('Foydalanuvchi topilmadi', ErrorCode.USER_NOT_FOUND);
    }
    return user;
  }

  /**
   * Telefon boʻyicha foydalanuvchini topadi yoki yaratadi.
   *
   * Ikkita parallel OTP tasdiqlash bir vaqtda kelishi mumkin (foydalanuvchi
   * tugmani ikki marta bosdi), shuning uchun INSERT `ON CONFLICT DO NOTHING`
   * bilan ketadi va konfliktda mavjud yozuv qaytariladi — dublikat akkaunt
   * yaratilmaydi.
   */
  async findOrCreateByPhone(phone: string): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.findByPhone(phone);
    if (existing) return { user: existing, isNew: false };

    const inserted = await this.database.db
      .insertInto('users')
      .values({
        phone,
        status: 'PENDING_PROFILE',
        role: 'SHIPPER',
        phoneVerifiedAt: new Date(),
        referralCode: this.generateReferralCode(),
      })
      .onConflict((oc) => oc.column('phone').doNothing())
      .returningAll()
      .executeTakeFirst();

    if (inserted) {
      this.logger.log({ userId: inserted.id }, 'Yangi foydalanuvchi yaratildi');
      return { user: inserted, isNew: true };
    }

    // Konflikt yuz berdi — parallel soʻrov bizdan oldin yaratib ulgurgan
    const concurrent = await this.findByPhone(phone);
    if (!concurrent) {
      throw AppError.notFound('Foydalanuvchi topilmadi', ErrorCode.USER_NOT_FOUND);
    }
    return { user: concurrent, isNew: false };
  }

  /** Roʻyxatdan oʻtishni yakunlash: ism, familiya va rol. */
  async completeProfile(
    userId: string,
    input: { firstName: string; lastName: string; role: UserRole; lang?: LangCode },
  ): Promise<User> {
    const updated = await this.database.db
      .updateTable('users')
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        lang: input.lang,
        status: 'ACTIVE',
      })
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw AppError.notFound('Foydalanuvchi topilmadi', ErrorCode.USER_NOT_FOUND);
    }

    // Rolga mos profil yozuvi yaratiladi (idempotent)
    await this.ensureRoleProfiles(userId, input.role);
    return updated;
  }

  /** Profilning oʻzgarishi mumkin boʻlgan maydonlari. Rol bu yerda oʻzgarmaydi. */
  async updateProfile(
    userId: string,
    input: {
      firstName?: string;
      lastName?: string;
      lang?: LangCode;
      avatarKey?: string;
    },
  ): Promise<User> {
    const patch: UserUpdate = {};
    if (input.firstName !== undefined) patch.firstName = input.firstName;
    if (input.lastName !== undefined) patch.lastName = input.lastName;
    if (input.lang !== undefined) patch.lang = input.lang;
    if (input.avatarKey !== undefined) patch.avatarKey = input.avatarKey;

    if (Object.keys(patch).length === 0) {
      return this.getByIdOrFail(userId);
    }

    const updated = await this.database.db
      .updateTable('users')
      .set(patch)
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw AppError.notFound('Foydalanuvchi topilmadi', ErrorCode.USER_NOT_FOUND);
    }
    return updated;
  }

  async updateLastSeen(userId: string): Promise<void> {
    await this.database.db
      .updateTable('users')
      .set({ lastSeenAt: new Date() })
      .where('id', '=', userId)
      .execute();
  }

  /**
   * Akkaunt holatini tekshiradi. Bloklangan foydalanuvchi tokeni amal qilsa ham
   * ichkariga oʻtkazilmaydi — bu tekshiruv har bir soʻrovda bajariladi.
   */
  assertUsable(user: User): void {
    if (user.status === 'BANNED') {
      throw AppError.forbidden('Akkaunt bloklangan', ErrorCode.USER_BANNED);
    }
    if (user.status === 'SUSPENDED') {
      throw AppError.forbidden('Akkaunt vaqtincha toʻxtatilgan', ErrorCode.USER_SUSPENDED);
    }
  }

  toPublicProfile(user: User): PublicUserProfile {
    return {
      id: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarKey: user.avatarKey,
      lang: user.lang,
      ratingAvg: Number(user.ratingAvg),
      ratingCount: user.ratingCount,
      completedOrders: user.completedOrders,
      isProfileComplete: Boolean(user.firstName && user.lastName),
      createdAt: user.createdAt,
    };
  }

  private async ensureRoleProfiles(userId: string, role: UserRole): Promise<void> {
    if (role === 'SHIPPER' || role === 'BOTH') {
      await this.database.db
        .insertInto('shipperProfiles')
        .values({ userId })
        .onConflict((oc) => oc.column('userId').doNothing())
        .execute();
    }
    if (role === 'DRIVER' || role === 'BOTH') {
      await this.database.db
        .insertInto('driverProfiles')
        .values({ userId })
        .onConflict((oc) => oc.column('userId').doNothing())
        .execute();
    }
  }

  private generateReferralCode(): string {
    // Chalkashtirmaydigan alifbo: 0/O va 1/I/L yoʻq
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const bytes = randomBytes(8);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  }
}

import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { maskPhone } from '@/common/utils/phone.util';
import { DatabaseService } from '@/infra/database/database.service';
import type { LangCode } from '@/infra/database/database.types';
import { UsersService, type PublicUserProfile } from '@/modules/users/users.service';

import type { CompleteProfileDto, RefreshTokenDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { OtpService, type OtpRequestResult } from './otp.service';
import { TokenService, type DeviceInfo } from './token.service';

export interface AuthSessionResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUserProfile;
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly database: DatabaseService,
  ) {}

  async requestOtp(dto: RequestOtpDto, ip: string): Promise<OtpRequestResult> {
    return this.otp.request(dto.phone, ip, (dto.lang ?? 'uz') as LangCode);
  }

  /**
   * Kodni tekshiradi, foydalanuvchini topadi/yaratadi va sessiya ochadi.
   * Har bir urinish — muvaffaqiyatli ham, muvaffaqiyatsiz ham — `login_history`
   * ga yoziladi. Bu keyinchalik "akkauntim buzildi" shikoyatlarini tekshirishning
   * yagona ishonchli usuli.
   */
  async verifyOtp(dto: VerifyOtpDto, ip: string, userAgent: string): Promise<AuthSessionResult> {
    try {
      await this.otp.verify(dto.phone, dto.code);
    } catch (error) {
      await this.recordLogin({
        phone: dto.phone,
        success: false,
        failReason: error instanceof AppError ? error.code : 'UNKNOWN',
        ip,
        userAgent,
      });
      throw error;
    }

    const { user, isNew } = await this.users.findOrCreateByPhone(dto.phone);
    this.users.assertUsable(user);

    if (!user.phoneVerifiedAt) {
      await this.database.db
        .updateTable('users')
        .set({ phoneVerifiedAt: new Date() })
        .where('id', '=', user.id)
        .execute();
    }

    const device: DeviceInfo = {
      deviceId: dto.device?.deviceId,
      platform: dto.device?.platform,
      appVersion: dto.device?.appVersion,
      ip,
      userAgent,
    };

    const pair = await this.tokens.issueSession(user, device);

    await this.recordLogin({
      userId: user.id,
      phone: dto.phone,
      success: true,
      ip,
      userAgent,
    });

    this.logger.log(
      { userId: user.id, phone: maskPhone(dto.phone), isNew },
      'Foydalanuvchi tizimga kirdi',
    );

    return {
      ...pair,
      user: this.users.toPublicProfile(user),
      isNewUser: isNew || !user.firstName,
    };
  }

  async refresh(dto: RefreshTokenDto, ip: string, userAgent: string): Promise<AuthSessionResult> {
    const rotated = await this.tokens.rotate(dto.refreshToken, {
      deviceId: dto.device?.deviceId,
      platform: dto.device?.platform,
      appVersion: dto.device?.appVersion,
      ip,
      userAgent,
    });

    const user = await this.users.getByIdOrFail(rotated.userId);

    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: rotated.expiresIn,
      user: this.users.toPublicProfile(user),
      isNewUser: false,
    };
  }

  async completeProfile(userId: string, dto: CompleteProfileDto): Promise<PublicUserProfile> {
    const user = await this.users.getByIdOrFail(userId);
    this.users.assertUsable(user);

    if (user.firstName && user.lastName) {
      // Profil allaqachon toʻldirilgan — bu endpoint faqat bir marta ishlaydi.
      // Keyingi oʻzgarishlar PATCH /me orqali (alohida huquqlar va audit bilan).
      throw AppError.conflict(
        ErrorCode.USER_PROFILE_INCOMPLETE,
        'Profil allaqachon toʻldirilgan. Oʻzgartirish uchun PATCH /me dan foydalaning.',
      );
    }

    const updated = await this.users.completeProfile(userId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      lang: dto.lang as LangCode | undefined,
    });

    return this.users.toPublicProfile(updated);
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.tokens.revokeSession(sessionId, userId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAllSessions(userId, 'user_requested');
  }

  async listSessions(userId: string) {
    return this.tokens.listSessions(userId);
  }

  private async recordLogin(entry: {
    userId?: string;
    phone: string;
    success: boolean;
    failReason?: string;
    ip: string;
    userAgent: string;
  }): Promise<void> {
    try {
      await this.database.db
        .insertInto('loginHistory')
        .values({
          userId: entry.userId ?? null,
          phone: entry.phone,
          success: entry.success,
          failReason: entry.failReason ?? null,
          ip: entry.ip,
          userAgent: entry.userAgent,
        })
        .execute();
    } catch (error) {
      // Audit yozuvi asosiy oqimni buzmasligi kerak — log qoladi, soʻrov davom etadi
      this.logger.warn({ err: error }, 'login_history ga yozib boʻlmadi');
    }
  }
}

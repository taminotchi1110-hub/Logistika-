import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';
import type { User, UserRole } from '@/infra/database/database.types';

export interface AccessTokenPayload {
  /** user.id */
  sub: string;
  role: UserRole;
  /** session id — sessiyani nuqtali bekor qilish uchun */
  sid: string;
  /** users.token_version — hammasini bir zumda bekor qilish uchun */
  ver: number;
}

export interface DeviceInfo {
  deviceId?: string;
  platform?: string;
  appVersion?: string;
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly refreshTtlDays: number;
  private readonly accessTtl: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.refreshTtlDays = config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    this.accessTtl = config.get('JWT_ACCESS_TTL', { infer: true });
  }

  // ------------------------------------------------------------ access token

  signAccessToken(user: Pick<User, 'id' | 'role' | 'tokenVersion'>, sessionId: string): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      sid: sessionId,
      ver: user.tokenVersion,
    };
    return this.jwt.sign(payload);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return this.jwt.verify<AccessTokenPayload>(token);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TokenExpiredError') {
        throw AppError.unauthorized('Token muddati tugagan', ErrorCode.AUTH_TOKEN_EXPIRED);
      }
      throw AppError.unauthorized('Token yaroqsiz', ErrorCode.AUTH_TOKEN_INVALID);
    }
  }

  // ----------------------------------------------------------- sessiya/refresh

  /**
   * Yangi sessiya ochadi va token juftligini qaytaradi.
   * Refresh token bazada OCHIQ HOLDA saqlanmaydi — faqat SHA-256 hash.
   * Baza dump'i oʻgʻirlansa ham tokenlardan foydalanib boʻlmaydi.
   */
  async issueSession(
    user: Pick<User, 'id' | 'role' | 'tokenVersion'>,
    device: DeviceInfo,
  ): Promise<TokenPair> {
    const refreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);

    const session = await this.database.db
      .insertInto('userSessions')
      .values({
        userId: user.id,
        refreshTokenHash: this.hashToken(refreshToken),
        deviceId: device.deviceId ?? null,
        platform: device.platform ?? null,
        appVersion: device.appVersion ?? null,
        ip: device.ip ?? null,
        userAgent: device.userAgent ?? null,
        expiresAt,
        lastUsedAt: new Date(),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    return {
      accessToken: this.signAccessToken(user, session.id),
      refreshToken,
      expiresIn: this.accessTtlSeconds(),
    };
  }

  /**
   * Refresh token rotatsiyasi.
   *
   * XAVFSIZLIK: eski token darhol bekor qilinadi. Agar allaqachon bekor
   * qilingan token qayta ishlatilsa — demak u oʻgʻirlangan (yoki nusxa
   * ishlatilmoqda). Bunday holda foydalanuvchining BARCHA sessiyalari
   * yopiladi: hujumchi ham, egasi ham chiqarib yuboriladi va egasi qaytadan
   * kiradi. Bu — "refresh token reuse detection" ning standart amaliyoti.
   */
  async rotate(refreshToken: string, device: DeviceInfo): Promise<TokenPair & { userId: string }> {
    const hash = this.hashToken(refreshToken);

    const session = await this.database.db
      .selectFrom('userSessions')
      .selectAll()
      .where('refreshTokenHash', '=', hash)
      .executeTakeFirst();

    if (!session) {
      throw AppError.unauthorized('Refresh token topilmadi', ErrorCode.AUTH_TOKEN_INVALID);
    }

    if (session.revokedAt) {
      this.logger.warn(
        { userId: session.userId, sessionId: session.id },
        'Bekor qilingan refresh token qayta ishlatildi — barcha sessiyalar yopilmoqda',
      );
      await this.revokeAllSessions(session.userId, 'refresh_reuse_detected');
      throw AppError.unauthorized(
        'Xavfsizlik sababli barcha sessiyalar yopildi. Qaytadan kiring.',
        ErrorCode.AUTH_REFRESH_REUSED,
      );
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw AppError.unauthorized('Sessiya muddati tugagan', ErrorCode.AUTH_TOKEN_EXPIRED);
    }

    const user = await this.database.db
      .selectFrom('users')
      .select(['id', 'role', 'tokenVersion', 'status'])
      .where('id', '=', session.userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!user) {
      throw AppError.unauthorized('Foydalanuvchi topilmadi', ErrorCode.USER_NOT_FOUND);
    }
    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      throw AppError.forbidden('Akkaunt bloklangan', ErrorCode.USER_BANNED);
    }

    const newRefreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);

    // Eski sessiyani yopish va yangisini ochish — bitta tranzaksiyada,
    // aks holda uzilish paytida foydalanuvchi ikkala tokendan ham ayriladi.
    const newSessionId = await this.database.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('userSessions')
        .values({
          userId: user.id,
          refreshTokenHash: this.hashToken(newRefreshToken),
          deviceId: device.deviceId ?? session.deviceId,
          platform: device.platform ?? session.platform,
          appVersion: device.appVersion ?? session.appVersion,
          ip: device.ip ?? null,
          userAgent: device.userAgent ?? session.userAgent,
          expiresAt,
          lastUsedAt: new Date(),
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('userSessions')
        .set({ revokedAt: new Date(), replacedBy: created.id })
        .where('id', '=', session.id)
        .execute();

      return created.id;
    });

    return {
      accessToken: this.signAccessToken(user, newSessionId),
      refreshToken: newRefreshToken,
      expiresIn: this.accessTtlSeconds(),
      userId: user.id,
    };
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.database.db
      .updateTable('userSessions')
      .set({ revokedAt: new Date() })
      .where('id', '=', sessionId)
      .where('userId', '=', userId)
      .where('revokedAt', 'is', null)
      .execute();
  }

  /**
   * Barcha sessiyalarni yopadi VA `token_version` ni oshiradi —
   * shunda hali muddati tugamagan access tokenlar ham darhol kuchsizlanadi.
   */
  async revokeAllSessions(userId: string, reason: string): Promise<void> {
    await this.database.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('userSessions')
        .set({ revokedAt: new Date() })
        .where('userId', '=', userId)
        .where('revokedAt', 'is', null)
        .execute();

      await trx
        .updateTable('users')
        .set((eb) => ({ tokenVersion: eb('tokenVersion', '+', 1) }))
        .where('id', '=', userId)
        .execute();
    });

    this.logger.log({ userId, reason }, 'Barcha sessiyalar bekor qilindi');
  }

  async listSessions(userId: string) {
    return this.database.db
      .selectFrom('userSessions')
      .select(['id', 'deviceId', 'platform', 'appVersion', 'ip', 'createdAt', 'lastUsedAt'])
      .where('userId', '=', userId)
      .where('revokedAt', 'is', null)
      .where('expiresAt', '>', new Date())
      .orderBy('lastUsedAt', 'desc')
      .execute();
  }

  /** Guard uchun: sessiya hali tirikmi? */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const row = await this.database.db
      .selectFrom('userSessions')
      .select(['id'])
      .where('id', '=', sessionId)
      .where('revokedAt', 'is', null)
      .where('expiresAt', '>', new Date())
      .executeTakeFirst();
    return Boolean(row);
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.database.db
      .updateTable('userSessions')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', sessionId)
      .execute();
  }

  // ------------------------------------------------------------------ helpers

  private generateRefreshToken(): string {
    // 256 bit entropiya — bruteforce amalda imkonsiz
    return randomBytes(32).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Vaqt hujumidan himoyalangan solishtirish (hash'lar uchun). */
  static safeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }

  private accessTtlSeconds(): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(this.accessTtl);
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 };
    return Math.floor(value * (multipliers[unit] ?? 1));
  }
}

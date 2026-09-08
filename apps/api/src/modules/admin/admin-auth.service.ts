import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { authenticator } from 'otplib';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';

/**
 * Noto'g'ri urinishlar soni — shundan keyin akkaunt vaqtincha bloklanadi.
 * Foydalanuvchi OTP'siga qaraganda qattiqroq: admin paneli butun
 * platformaga kirish huquqini beradi.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/** Admin tokeni qisqa yashaydi — o'g'irlangan token uzoq ishlamasin. */
const ADMIN_TOKEN_TTL = '2h';

/**
 * Argon2id parametrlari — OWASP 2024 tavsiyasi.
 *
 * `memoryCost` eng muhim parametr: GPU hujumini qimmatlashtiradi.
 * 19 MiB — server uchun sezilarsiz, hujumchi uchun sezilarli.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export interface AdminSession {
  adminId: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
}

/**
 * Admin autentifikatsiyasi.
 *
 * FOYDALANUVCHI AUTENTIFIKATSIYASIDAN BUTUNLAY AJRATILGAN:
 *   - boshqa jadval (`admin_users`), boshqa token, boshqa guard
 *   - parol + MAJBURIY TOTP (ikki faktor)
 *   - token 2 soat yashaydi (foydalanuvchida 15 daqiqa + refresh)
 *
 * NEGA AJRATILGAN: admin tokeni bilan foydalanuvchi endpointlariga
 * kirish va aksincha — mumkin bo'lmasligi kerak. Bitta tokenda ikki
 * xil huquq bo'lsa, bitta xato butun tizimni ochib beradi.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    // Admin tokeni FOYDALANUVCHI kalitidan boshqa kalit bilan
    // imzolanadi: foydalanuvchi tokenini admin tokeni sifatida
    // ishlatib bo'lmasligi kerak
    this.jwtSecret = config.get('ADMIN_JWT_SECRET', { infer: true }) ?? '';
  }

  /** Parol xeshi — ro'yxatdan o'tkazishda va parol o'zgartirishda. */
  static async hashPassword(password: string): Promise<string> {
    return hash(password, ARGON_OPTIONS);
  }

  /** TOTP maxfiy kalitini generatsiya qiladi. */
  static generateTotpSecret(): string {
    return authenticator.generateSecret();
  }

  /** Authenticator ilovasi uchun QR havolasi. */
  static totpUri(email: string, secret: string): string {
    return authenticator.keyuri(email, 'KARVON Admin', secret);
  }

  /**
   * Kirish: email + parol + TOTP kodi.
   *
   * XATO XABARI ATAYLAB UMUMIY: "email yoki parol notoʻgʻri". Aniq
   * aytilsa ("bunday email yoʻq"), hujumchi mavjud adminlar ro'yxatini
   * to'play oladi.
   */
  async login(input: {
    email: string;
    password: string;
    totp: string;
    ip?: string;
  }): Promise<{ accessToken: string; admin: AdminSession }> {
    if (!this.jwtSecret) {
      throw AppError.unauthorized('Admin paneli sozlanmagan');
    }

    const admin = await this.database.db
      .selectFrom('adminUsers as a')
      .innerJoin('adminRoles as r', 'r.id', 'a.roleId')
      .select([
        'a.id',
        'a.email',
        'a.passwordHash',
        'a.fullName',
        'a.totpSecretEnc',
        'a.isActive',
        'a.failedAttempts',
        'a.lockedUntil',
        'r.code as roleCode',
        'r.permissions',
      ])
      .where('a.email', '=', input.email.toLowerCase().trim())
      .executeTakeFirst();

    // Vaqt hujumiga qarshi: admin topilmasa ham xeshlashga vaqt sarflaymiz,
    // aks holda javob tezligidan email mavjudligini bilib olish mumkin
    if (!admin) {
      await verify(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000',
        input.password,
        ARGON_OPTIONS,
      ).catch(() => false);
      throw AppError.unauthorized('Email yoki parol notoʻgʻri');
    }

    if (!admin.isActive) {
      throw AppError.unauthorized('Akkaunt faol emas');
    }

    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60_000);
      throw AppError.tooManyRequests(
        `Akkaunt bloklangan. ${minutes} daqiqadan keyin urinib koʻring.`,
        ErrorCode.ADMIN_ACCOUNT_LOCKED,
        { retryAfterSeconds: minutes * 60 },
      );
    }

    const passwordOk = await verify(admin.passwordHash, input.password, ARGON_OPTIONS).catch(
      () => false,
    );

    if (!passwordOk) {
      await this.registerFailure(admin.id, admin.failedAttempts);
      throw AppError.unauthorized('Email yoki parol notoʻgʻri');
    }

    // TOTP MAJBURIY: kalit yo'q bo'lsa kirishga ruxsat bermaymiz.
    // "Hozircha 2FA siz ishlatamiz" — eng ko'p uchraydigan va eng
    // qimmat xavfsizlik yon berishi.
    if (!admin.totpSecretEnc) {
      this.logger.error({ adminId: admin.id }, 'Admin akkauntida TOTP sozlanmagan');
      throw AppError.unauthorized('Ikki faktorli autentifikatsiya sozlanmagan');
    }

    const secret = admin.totpSecretEnc.toString('utf8');
    if (!authenticator.check(input.totp, secret)) {
      await this.registerFailure(admin.id, admin.failedAttempts);
      throw AppError.unauthorized('Tasdiqlash kodi notoʻgʻri');
    }

    await this.database.db
      .updateTable('adminUsers')
      .set({
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: input.ip ?? null,
      })
      .where('id', '=', admin.id)
      .execute();

    const permissions = Array.isArray(admin.permissions) ? (admin.permissions as string[]) : [];

    const session: AdminSession = {
      adminId: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.roleCode,
      permissions,
    };

    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, email: admin.email, role: admin.roleCode, permissions, scope: 'admin' },
      { secret: this.jwtSecret, expiresIn: ADMIN_TOKEN_TTL },
    );

    this.logger.log({ adminId: admin.id, email: admin.email, ip: input.ip }, 'Admin kirdi');

    return { accessToken, admin: session };
  }

  /** Tokenni tekshiradi — guard chaqiradi. */
  async verifyToken(token: string): Promise<AdminSession> {
    if (!this.jwtSecret) {
      throw AppError.unauthorized('Admin paneli sozlanmagan');
    }

    let payload: {
      sub: string;
      email: string;
      role: string;
      permissions: string[];
      scope: string;
    };

    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.jwtSecret });
    } catch {
      throw AppError.unauthorized('Token yaroqsiz');
    }

    // `scope` tekshiruvi — foydalanuvchi tokeni bu yerga tushmasin
    if (payload.scope !== 'admin') {
      throw AppError.unauthorized('Token admin uchun emas');
    }

    // Har so'rovda bazadan tekshiramiz: bloklangan admin tokeni
    // muddati tugagunicha ishlab turmasligi kerak
    const admin = await this.database.db
      .selectFrom('adminUsers')
      .select(['id', 'isActive', 'fullName'])
      .where('id', '=', payload.sub)
      .executeTakeFirst();

    if (!admin?.isActive) {
      throw AppError.unauthorized('Akkaunt faol emas');
    }

    return {
      adminId: payload.sub,
      email: payload.email,
      fullName: admin.fullName,
      role: payload.role,
      permissions: payload.permissions ?? [],
    };
  }

  private async registerFailure(adminId: string, current: number): Promise<void> {
    const attempts = current + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await this.database.db
      .updateTable('adminUsers')
      .set({
        failedAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where('id', '=', adminId)
      .execute();

    if (shouldLock) {
      this.logger.warn({ adminId, attempts }, 'Admin akkaunti bloklandi');
    }
  }
}

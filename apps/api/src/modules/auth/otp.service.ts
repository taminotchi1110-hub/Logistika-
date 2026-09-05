import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'node:crypto';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { RateLimitService } from '@/common/services/rate-limit.service';
import { maskPhone } from '@/common/utils/phone.util';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';
import type { LangCode } from '@/infra/database/database.types';
import { SmsService } from '@/modules/sms/sms.service';

import { TokenService } from './token.service';

export interface OtpRequestResult {
  expiresInSeconds: number;
  resendAfterSeconds: number;
  /** Faqat dev muhitida toʻldiriladi — prodda har doim undefined. */
  devCode?: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  private readonly length: number;
  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;
  private readonly cooldownSeconds: number;
  private readonly maxPerHourPerPhone: number;
  private readonly maxPerDayPerIp: number;
  private readonly pepper: string;
  private readonly exposeCode: boolean;

  constructor(
    private readonly database: DatabaseService,
    private readonly sms: SmsService,
    private readonly rateLimit: RateLimitService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.length = config.get('OTP_LENGTH', { infer: true });
    this.ttlSeconds = config.get('OTP_TTL_SECONDS', { infer: true });
    this.maxAttempts = config.get('OTP_MAX_ATTEMPTS', { infer: true });
    this.cooldownSeconds = config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true });
    this.maxPerHourPerPhone = config.get('OTP_MAX_PER_HOUR_PER_PHONE', { infer: true });
    this.maxPerDayPerIp = config.get('OTP_MAX_PER_DAY_PER_IP', { infer: true });
    this.pepper = config.get('OTP_PEPPER', { infer: true });
    this.exposeCode =
      config.get('OTP_EXPOSE_CODE_IN_DEV', { infer: true }) &&
      config.get('NODE_ENV', { infer: true }) === 'development';
  }

  /**
   * Kod yuboradi.
   *
   * Uch qatlamli cheklov — har biri boshqa hujum turiga qarshi:
   *  1. Cooldown (60 s) — tugmani ketma-ket bosishdan va arzon spamdan.
   *  2. Soatiga N ta bitta raqamga — maqsadli "SMS bombing" dan.
   *  3. Kuniga N ta bitta IP dan — koʻp raqamga skript bilan yuborishdan.
   *
   * Bu shunchaki xavfsizlik emas, TOʻGʻRIDAN-TOʻGʻRI PUL: har bir SMS ~50–80 soʻm.
   */
  async request(phone: string, ip: string, lang: LangCode = 'uz'): Promise<OtpRequestResult> {
    const cooldown = await this.rateLimit.acquireCooldown(`otp:${phone}`, this.cooldownSeconds);
    if (!cooldown.acquired) {
      throw AppError.tooManyRequests(
        `Yangi kod ${cooldown.retryAfterSeconds} soniyadan keyin yuboriladi`,
        ErrorCode.OTP_COOLDOWN,
        { retryAfterSeconds: cooldown.retryAfterSeconds },
      );
    }

    const perPhone = await this.rateLimit.consume(
      `otp:hour:${phone}`,
      this.maxPerHourPerPhone,
      3600,
    );
    if (!perPhone.allowed) {
      await this.rateLimit.releaseCooldown(`otp:${phone}`);
      throw AppError.tooManyRequests(
        'Bu raqamga juda koʻp kod yuborildi. Bir soatdan keyin urinib koʻring.',
        ErrorCode.OTP_TOO_MANY_REQUESTS,
        { retryAfterSeconds: perPhone.retryAfterSeconds },
      );
    }

    const perIp = await this.rateLimit.consume(`otp:day:${ip}`, this.maxPerDayPerIp, 86_400);
    if (!perIp.allowed) {
      await this.rateLimit.releaseCooldown(`otp:${phone}`);
      throw AppError.tooManyRequests(
        'Kunlik limit tugadi. Ertaga urinib koʻring.',
        ErrorCode.OTP_TOO_MANY_REQUESTS,
        { retryAfterSeconds: perIp.retryAfterSeconds },
      );
    }

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    // Eski tasdiqlanmagan kodlarni bekor qilamiz: bir vaqtda faqat bitta
    // amaldagi kod boʻlsin, aks holda eski kod bilan ham kirish mumkin boʻladi.
    await this.database.db
      .updateTable('otpRequests')
      .set({ consumedAt: new Date() })
      .where('phone', '=', phone)
      .where('purpose', '=', 'LOGIN')
      .where('consumedAt', 'is', null)
      .execute();

    await this.database.db
      .insertInto('otpRequests')
      .values({
        phone,
        codeHash: this.hashCode(phone, code),
        purpose: 'LOGIN',
        ip,
        expiresAt,
      })
      .execute();

    try {
      await this.sms.sendOtp(phone, code, lang);
    } catch {
      // SMS ketmasa foydalanuvchiga rost gapiramiz va cooldown'ni bo'shatamiz —
      // aks holda u 60 soniya bekorga kutadi.
      await this.rateLimit.releaseCooldown(`otp:${phone}`);
      throw AppError.unprocessable(
        ErrorCode.OTP_SEND_FAILED,
        'SMS yuborib boʻlmadi. Birozdan keyin qayta urinib koʻring.',
      );
    }

    this.logger.log({ phone: maskPhone(phone) }, 'OTP yuborildi');

    return {
      expiresInSeconds: this.ttlSeconds,
      resendAfterSeconds: this.cooldownSeconds,
      devCode: this.exposeCode ? code : undefined,
    };
  }

  /**
   * Kodni tekshiradi. Muvaffaqiyatli boʻlsa kod "isteʼmol qilingan" deb
   * belgilanadi — bitta kod faqat bir marta ishlaydi (replay himoyasi).
   */
  async verify(phone: string, code: string): Promise<void> {
    const otp = await this.database.db
      .selectFrom('otpRequests')
      .selectAll()
      .where('phone', '=', phone)
      .where('purpose', '=', 'LOGIN')
      .where('consumedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst();

    if (!otp) {
      throw AppError.badRequest(
        ErrorCode.OTP_NOT_FOUND,
        'Kod topilmadi. Yangi kod soʻrang.',
      );
    }

    if (new Date(otp.expiresAt).getTime() <= Date.now()) {
      throw AppError.badRequest(ErrorCode.OTP_EXPIRED, 'Kod muddati tugagan. Yangi kod soʻrang.');
    }

    if (otp.attempts >= this.maxAttempts) {
      await this.consume(otp.id);
      throw AppError.tooManyRequests(
        'Juda koʻp notoʻgʻri urinish. Yangi kod soʻrang.',
        ErrorCode.OTP_TOO_MANY_ATTEMPTS,
      );
    }

    const expected = this.hashCode(phone, code);
    if (!TokenService.safeEqual(expected, otp.codeHash)) {
      const updated = await this.database.db
        .updateTable('otpRequests')
        .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
        .where('id', '=', otp.id)
        .returning(['attempts'])
        .executeTakeFirst();

      const attemptsLeft = Math.max(0, this.maxAttempts - (updated?.attempts ?? this.maxAttempts));
      throw AppError.badRequest(ErrorCode.OTP_INCORRECT, 'Kod notoʻgʻri', { attemptsLeft });
    }

    await this.consume(otp.id);
    await this.rateLimit.releaseCooldown(`otp:${phone}`);
  }

  private async consume(otpId: string): Promise<void> {
    await this.database.db
      .updateTable('otpRequests')
      .set({ consumedAt: new Date() })
      .where('id', '=', otpId)
      .execute();
  }

  /**
   * Kriptografik jihatdan xavfsiz kod.
   * `Math.random()` bu yerda QATʼIYAN mumkin emas — u bashorat qilinadi.
   */
  private generateCode(): string {
    const max = 10 ** this.length;
    return String(randomInt(0, max)).padStart(this.length, '0');
  }

  /**
   * Kod hash'i. Telefon raqami ham hash'ga kiradi — shunda bir raqamning
   * kodi boshqasiga toʻgʻri kelib qolishi mumkin emas (rainbow table himoyasi).
   */
  private hashCode(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}:${this.pepper}`).digest('hex');
  }
}

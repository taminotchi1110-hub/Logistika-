import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { maskPhone } from '@/common/utils/phone.util';
import type { Env } from '@/config/env.schema';

import type { SmsMessage, SmsProvider, SmsSendResult } from '../sms-provider.interface';

interface EskizLoginResponse {
  data?: { token?: string };
  message?: string;
}

interface EskizSendResponse {
  id?: string;
  status?: string;
  message?: string;
}

/**
 * Eskiz.uz (notify.eskiz.uz) provayderi.
 *
 * Amaliy jihatlar:
 *  • Token ~30 kun amal qiladi → xotirada saqlanadi, 401 kelganda qayta olinadi.
 *  • Har bir SMS shabloni operator tomonidan OLDINDAN tasdiqlanishi kerak
 *    (1–3 ish kuni). Tasdiqlanmagan matn yuborilsa xato qaytadi.
 *  • Jo'natuvchi nomi (`from`) alohida ro'yxatdan o'tkaziladi.
 */
@Injectable()
export class EskizSmsProvider implements SmsProvider {
  readonly name = 'eskiz';
  private readonly logger = new Logger('SMS:eskiz');
  private token: string | null = null;
  private tokenPromise: Promise<string> | null = null;

  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private readonly from: string;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.baseUrl = config.get('ESKIZ_BASE_URL', { infer: true });
    this.email = config.get('ESKIZ_EMAIL', { infer: true }) ?? '';
    this.password = config.get('ESKIZ_PASSWORD', { infer: true }) ?? '';
    this.from = config.get('SMS_SENDER_NAME', { infer: true });
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const attempt = async (token: string): Promise<Response> =>
      fetch(`${this.baseUrl}/message/sms/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Eskiz mamlakat kodisiz kutadi: 998901234567 emas, 901234567 ham emas —
          // hujjatga ko'ra "+" siz to'liq raqam
          mobile_phone: message.to.replace('+', ''),
          message: message.text,
          from: this.from,
        }),
        signal: AbortSignal.timeout(10_000),
      });

    let token = await this.getToken();
    let response = await attempt(token);

    // Token eskirgan bo'lsa bir marta yangilab qayta urinamiz
    if (response.status === 401) {
      this.token = null;
      token = await this.getToken();
      response = await attempt(token);
    }

    const body = (await response.json().catch(() => ({}))) as EskizSendResponse;

    if (!response.ok) {
      this.logger.error(
        { status: response.status, body, to: maskPhone(message.to) },
        'Eskiz SMS yuborilmadi',
      );
      throw new Error(`Eskiz xatosi: ${response.status} ${body.message ?? ''}`);
    }

    return { providerMessageId: body.id };
  }

  /** Tokenni oladi. Parallel so'rovlar bitta login qilishi uchun promise cache. */
  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    if (this.tokenPromise) return this.tokenPromise;

    this.tokenPromise = (async () => {
      const form = new FormData();
      form.append('email', this.email);
      form.append('password', this.password);

      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(10_000),
      });

      const body = (await response.json().catch(() => ({}))) as EskizLoginResponse;
      const token = body.data?.token;

      if (!response.ok || !token) {
        throw new Error(`Eskiz login xatosi: ${response.status} ${body.message ?? ''}`);
      }

      this.token = token;
      return token;
    })();

    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = null;
    }
  }
}

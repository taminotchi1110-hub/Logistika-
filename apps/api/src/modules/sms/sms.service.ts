import { Inject, Injectable, Logger } from '@nestjs/common';

import { maskPhone } from '@/common/utils/phone.util';
import type { LangCode } from '@/infra/database/database.types';

import { SMS_PROVIDER, type SmsProvider } from './sms-provider.interface';

/**
 * OTP matnlari uch tilda. Bu matnlar Eskiz'da OLDINDAN tasdiqlanishi kerak —
 * har qanday oʻzgarish yangi moderatsiya talab qiladi, shuning uchun ular
 * bitta joyda va oʻzgarmas.
 */
const OTP_TEMPLATES: Record<LangCode, (code: string) => string> = {
  uz: (code) => `Karvon: tasdiqlash kodi ${code}. Kodni hech kimga bermang.`,
  ru: (code) => `Karvon: код подтверждения ${code}. Никому не сообщайте код.`,
  en: (code) => `Karvon: your verification code is ${code}. Do not share it with anyone.`,
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(SMS_PROVIDER) private readonly provider: SmsProvider) {}

  async sendOtp(phone: string, code: string, lang: LangCode = 'uz'): Promise<void> {
    const text = (OTP_TEMPLATES[lang] ?? OTP_TEMPLATES.uz)(code);
    await this.send(phone, text);
  }

  async send(phone: string, text: string): Promise<void> {
    try {
      const result = await this.provider.send({ to: phone, text });
      this.logger.log(
        { provider: this.provider.name, to: maskPhone(phone), id: result.providerMessageId },
        'SMS yuborildi',
      );
    } catch (error) {
      // Xato yuqoriga uzatiladi: foydalanuvchi "kod yuborildi" degan yolgʻon
      // xabarni koʻrmasligi kerak. Log esa raqamni maskalab yozadi.
      this.logger.error(
        { err: error, provider: this.provider.name, to: maskPhone(phone) },
        'SMS yuborilmadi',
      );
      throw error;
    }
  }
}

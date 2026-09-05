import { Injectable, Logger } from '@nestjs/common';

import { maskPhone } from '@/common/utils/phone.util';

import type { SmsMessage, SmsProvider, SmsSendResult } from '../sms-provider.interface';

/**
 * Dev provayder: hech narsa yubormaydi, faqat logga chiqaradi.
 * Shu tufayli lokal ishlab chiqishda SMS hisobi sarflanmaydi va internet kerak emas.
 * Prodda ishlatilishi `env.schema.ts` da bloklangan.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('SMS:console');

  async send(message: SmsMessage): Promise<SmsSendResult> {
    this.logger.log(`SMS → ${maskPhone(message.to)} :: ${message.text}`);
    return { providerMessageId: `console-${Date.now()}` };
  }
}

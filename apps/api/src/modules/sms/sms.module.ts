import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '@/config/env.schema';

import { ConsoleSmsProvider } from './providers/console.provider';
import { EskizSmsProvider } from './providers/eskiz.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms-provider.interface';
import { SmsService } from './sms.service';

@Module({
  providers: [
    ConsoleSmsProvider,
    EskizSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, ConsoleSmsProvider, EskizSmsProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        consoleProvider: ConsoleSmsProvider,
        eskizProvider: EskizSmsProvider,
      ): SmsProvider =>
        config.get('SMS_PROVIDER', { infer: true }) === 'eskiz' ? eskizProvider : consoleProvider,
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}

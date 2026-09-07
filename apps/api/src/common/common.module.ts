import { Global, Module } from '@nestjs/common';

import { RateLimitService } from './services/rate-limit.service';
import { SettingsService } from './services/settings.service';

@Global()
@Module({
  providers: [RateLimitService, SettingsService],
  exports: [RateLimitService, SettingsService],
})
export class CommonModule {}

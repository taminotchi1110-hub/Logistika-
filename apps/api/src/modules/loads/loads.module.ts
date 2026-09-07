import { Module } from '@nestjs/common';

import { GeoModule } from '@/modules/geo/geo.module';

import { LoadsController } from './loads.controller';
import { LoadsService } from './loads.service';
import { PricingService } from './pricing.service';

@Module({
  imports: [GeoModule],
  controllers: [LoadsController],
  providers: [LoadsService, PricingService],
  exports: [LoadsService, PricingService],
})
export class LoadsModule {}

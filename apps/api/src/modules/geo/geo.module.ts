import { Module } from '@nestjs/common';

import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { GeocodingService } from './geocoding.service';
import { RoutingService } from './routing.service';

@Module({
  controllers: [GeoController],
  providers: [GeoService, GeocodingService, RoutingService],
  exports: [GeoService, GeocodingService, RoutingService],
})
export class GeoModule {}

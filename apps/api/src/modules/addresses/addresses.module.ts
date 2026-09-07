import { Module } from '@nestjs/common';

import { GeoModule } from '@/modules/geo/geo.module';

import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

@Module({
  imports: [GeoModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}

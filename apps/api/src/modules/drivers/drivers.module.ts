import { Module } from '@nestjs/common';

import { DocumentsModule } from '@/modules/documents/documents.module';
import { VehiclesModule } from '@/modules/vehicles/vehicles.module';

import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [DocumentsModule, VehiclesModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}

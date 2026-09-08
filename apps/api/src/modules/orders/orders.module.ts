import { Module } from '@nestjs/common';

import { DriversModule } from '@/modules/drivers/drivers.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { VehiclesModule } from '@/modules/vehicles/vehicles.module';

import { OffersService } from './offers.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [DriversModule, VehiclesModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OffersService],
  exports: [OrdersService, OffersService],
})
export class OrdersModule {}

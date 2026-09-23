import { Module } from '@nestjs/common';

import { LoadsModule } from '@/modules/loads/loads.module';
import { OrdersModule } from '@/modules/orders/orders.module';

import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [OrdersModule, LoadsModule],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}

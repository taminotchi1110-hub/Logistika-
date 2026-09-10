import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { PaymentsModule } from '@/modules/payments/payments.module';
import { OrdersModule } from '@/modules/orders/orders.module';

import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

/**
 * Admin paneli.
 *
 * `JwtModule.register({})` — kalit har imzolashda aniq beriladi
 * (`AdminAuthService`), chunki admin tokeni foydalanuvchi tokenidan
 * BOSHQA kalit bilan imzolanadi.
 */
@Module({
  imports: [JwtModule.register({}), PaymentsModule, OrdersModule],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminService, AdminGuard],
  exports: [AdminAuthService],
})
export class AdminModule {}

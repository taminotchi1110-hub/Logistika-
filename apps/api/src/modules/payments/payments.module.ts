import { Module } from '@nestjs/common';

import { EscrowService } from './escrow.service';
import { LedgerService } from './ledger.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsListener } from './payments.listener';
import { PayoutsService } from './payouts.service';
import { PaymentWebhooksController } from './webhooks.controller';

/**
 * Moliya moduli.
 *
 * Boshqa modullarga bogʻlanmaydi: buyurtma toʻlovi hodisa orqali
 * boshqariladi (`order.statusChanged`). Shu sababli moliyani alohida
 * servisga ajratish yoki auditga berish oson — u faqat oʻz jadvallari
 * bilan ishlaydi.
 */
@Module({
  controllers: [PaymentsController, PaymentWebhooksController],
  providers: [LedgerService, PaymentsService, EscrowService, PayoutsService, PaymentsListener],
  exports: [LedgerService, EscrowService, PaymentsService, PayoutsService],
})
export class PaymentsModule {}

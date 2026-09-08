import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ORDER_STATUS_CHANGED, OrderStatusChangedEvent } from '@/modules/orders/order.events';

import { EscrowService } from './escrow.service';

/** Reys boshlangandan keyingi bekor qilish — jarima qo'llanadi. */
const STARTED_STATUSES = new Set([
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'ARRIVED_AT_DELIVERY',
]);

const CANCELLED_BY: Record<string, 'SHIPPER' | 'DRIVER' | 'ADMIN'> = {
  CANCELLED_BY_SHIPPER: 'SHIPPER',
  CANCELLED_BY_DRIVER: 'DRIVER',
  CANCELLED_BY_ADMIN: 'ADMIN',
};

/**
 * Buyurtma holati o'zgarganda pul harakatlarini boshqaradi.
 *
 * NEGA HODISA ORQALI: `OrdersService` moliyani bilmasligi kerak.
 * Buyurtma mantiqi va pul mantiqi — ikki xil sabab bilan o'zgaradi
 * (biri mahsulot talabi, ikkinchisi buxgalteriya va qonun). Ularni
 * ajratib turish keyingi o'zgarishlarni xavfsiz qiladi.
 *
 * XATO YUTILMAYDI, LEKIN BUYURTMANI HAM BUZMAYDI: pul o'tkazilmasa
 * bu ERROR darajasida logga tushadi va admin qo'lda tuzatadi. Buyurtma
 * holatini orqaga qaytarish esa bundan ham yomon — haydovchi yukni
 * allaqachon topshirgan bo'lishi mumkin.
 */
@Injectable()
export class PaymentsListener {
  private readonly logger = new Logger(PaymentsListener.name);

  constructor(private readonly escrow: EscrowService) {}

  @OnEvent(ORDER_STATUS_CHANGED, { async: true })
  async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    try {
      if (event.to === 'COMPLETED') {
        await this.escrow.release(event.orderId);
        return;
      }

      const cancelledBy = CANCELLED_BY[event.to];
      if (cancelledBy) {
        const result = await this.escrow.refund({
          orderId: event.orderId,
          cancelledBy,
          hadStarted: STARTED_STATUSES.has(event.from),
        });

        this.logger.log(
          { orderId: event.orderId, cancelledBy, penaltyTiyin: result.penaltyTiyin },
          'Bekor qilingan buyurtma boʻyicha hisob-kitob',
        );
      }
    } catch (error) {
      this.logger.error(
        { err: error, orderId: event.orderId, from: event.from, to: event.to },
        'Buyurtma toʻlovini bajarib boʻlmadi — QOʻLDA TEKSHIRISH KERAK',
      );
    }
  }
}

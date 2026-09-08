import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ORDER_STATUS_CHANGED, OrderStatusChangedEvent } from '@/modules/orders/order.events';

import { TrackingService } from './tracking.service';

/** Marshrut arxivlanadigan holatlar — yuk topshirilgan yoki reys tugagan. */
const FINALIZE_ON: string[] = [
  'DELIVERED',
  'COMPLETED',
  'CANCELLED_BY_SHIPPER',
  'CANCELLED_BY_DRIVER',
  'CANCELLED_BY_ADMIN',
];

/**
 * Buyurtma tugaganda marshrutni arxivga yozadi.
 *
 * NEGA STATUS O'ZGARISHIDA: `driver_locations` partitionlari vaqt o'tishi
 * bilan o'chiriladi (saqlash xarajati va GDPR-ga o'xshash talablar).
 * Marshrut esa nizoda dalil bo'lishi mumkin, shuning uchun u siqilgan
 * polyline sifatida alohida saqlanadi. Bekor qilingan buyurtmada ham
 * arxivlaymiz: "haydovchi umuman yo'lga chiqmadi" degan da'voni aynan
 * shu ma'lumot hal qiladi.
 */
@Injectable()
export class TrackingListener {
  private readonly logger = new Logger(TrackingListener.name);

  constructor(private readonly tracking: TrackingService) {}

  @OnEvent(ORDER_STATUS_CHANGED, { async: true })
  async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (!FINALIZE_ON.includes(event.to)) return;

    try {
      await this.tracking.finalize(event.orderId);
    } catch (error) {
      // Arxivlash asosiy oqimga taʼsir qilmaydi — xom nuqtalar joyida
      this.logger.error(
        { err: error, orderId: event.orderId },
        'Marshrutni arxivlab boʻlmadi — xom nuqtalar saqlanib qoldi',
      );
    }
  }
}

/**
 * Buyurtma hodisalari.
 *
 * `loads/load.events.ts` dagi kabi: modullar bir-birini to'g'ridan-to'g'ri
 * chaqirmasligi uchun. Kuzatuv moduli buyurtmalar modulini bilmaydi va
 * aksincha — ular faqat hodisa nomi orqali bog'langan.
 */
export const ORDER_STATUS_CHANGED = 'order.statusChanged';

export class OrderStatusChangedEvent {
  constructor(
    readonly orderId: string,
    readonly from: string,
    readonly to: string,
    readonly driverId: string,
    readonly shipperId: string,
  ) {}
}

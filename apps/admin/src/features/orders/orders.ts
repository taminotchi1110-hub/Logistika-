/**
 * Buyurtma monitoringi.
 */

export interface OrderRow {
  id: string;
  publicNo: string;
  status: string;
  priceTiyin: string;
  commissionTiyin: string;
  paymentStatus: string;
  createdAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  loadTitle: string | null;
  pickupAddress: string | null;
  deliveryAddress: string | null;
  shipperId: string;
  shipperFirstName: string | null;
  shipperLastName: string | null;
  /** Yashirilgan: `+9989011****3`. */
  shipperPhone: string | null;
  driverId: string;
  driverFirstName: string | null;
  driverLastName: string | null;
  driverPhone: string | null;
}

export interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: string | null;
  note: string | null;
  createdAt: string;
  actorFirstName: string | null;
  actorLastName: string | null;
}

export interface OrderDetail {
  order: OrderRow & {
    driverPayoutTiyin: string;
    penaltyTiyin: string;
    paymentMethod: string;
    plannedDistanceKm: string | null;
    actualDistanceKm: string | null;
    cancelReason: string | null;
    confirmedAt: string | null;
    pickedUpAt: string | null;
    completedAt: string | null;
    loadWeightKg: string | null;
    distanceKm: string | null;
    vehicleBrand: string | null;
    vehicleModel: string | null;
    vehiclePlate: string | null;
    conversationId: string | null;
  };
  history: StatusHistoryEntry[];
  finance: {
    priceFormatted: string;
    commissionFormatted: string;
    driverPayoutFormatted: string;
    penaltyFormatted: string;
  };
}

export interface ChatMessage {
  id: string;
  type: string;
  body: string | null;
  senderId: string | null;
  createdAt: string;
  readAt: string | null;
  senderFirstName: string | null;
  senderLastName: string | null;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Tayinlangan',
  CONFIRMED: 'Tasdiqlangan',
  EN_ROUTE_TO_PICKUP: 'Yuk olishga ketmoqda',
  ARRIVED_AT_PICKUP: 'Yuk olish joyida',
  LOADED: 'Yuklandi',
  IN_TRANSIT: 'Yoʻlda',
  ARRIVED_AT_DELIVERY: 'Yetkazish joyida',
  DELIVERED: 'Yetkazildi',
  COMPLETED: 'Yakunlandi',
  CLOSED: 'Yopilgan',
  DISPUTED: 'Nizoli',
  CANCELLED_BY_SHIPPER: 'Yuk beruvchi bekor qildi',
  CANCELLED_BY_DRIVER: 'Haydovchi bekor qildi',
  CANCELLED_BY_ADMIN: 'Admin bekor qildi',
};

/** Support uchun filtr tugmalari — hammasi emas, eng kerakli uchtasi. */
export const STATUS_FILTERS = [
  { value: '', label: 'Hammasi' },
  { value: 'DISPUTED', label: 'Nizoli' },
  { value: 'IN_TRANSIT', label: 'Yoʻlda' },
  { value: 'DELIVERED', label: 'Yetkazildi' },
];

/**
 * Holat rangi.
 *
 * NIZO — QIZIL, bekor qilinganlar esa kulrang. Ular ikkalasi ham
 * "yomon" natija, lekin nizo ISH TALAB QILADI, bekor qilingan esa
 * allaqachon tugagan. Bir xil rangda ko'rsatish operatorni kerakmas
 * qatorlarga tortadi.
 */
export function orderTone(status: string): 'ok' | 'warn' | 'danger' | 'muted' | 'active' {
  if (status === 'DISPUTED') return 'danger';
  if (status.startsWith('CANCELLED')) return 'muted';
  if (status === 'COMPLETED' || status === 'CLOSED') return 'ok';
  if (status === 'DELIVERED') return 'warn';
  return 'active';
}

/**
 * Buyurtma tugaganmi.
 *
 * Tugagan buyurtmada "hozir qayerda?" degan savol ma'nosiz va
 * kuzatuv ko'rsatilmaydi.
 */
export function isFinished(status: string): boolean {
  return (
    status === 'COMPLETED' ||
    status === 'CLOSED' ||
    status.startsWith('CANCELLED')
  );
}

/**
 * Telefon yashirilganmi.
 *
 * Interfeys shu asosda "Raqamni ko'rsatish" tugmasini chizadi. Server
 * allaqachon yashirib yuboradi — bu funksiya faqat shu faktni
 * o'qiydi, o'zi yashirmaydi.
 */
export function isMasked(phone: string | null): boolean {
  return phone !== null && phone.includes('****');
}

export function personName(person: {
  firstName: string | null;
  lastName: string | null;
}): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return name || 'Ism koʻrsatilmagan';
}

/** `2026-09-10T08:30:00Z` → `10.09 08:30`. */
export function moment(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Ikki bosqich orasida qancha vaqt ketgan.
 *
 * Status tarixida eng foydali raqam: "yuk olish joyida" dan
 * "yuklandi" gacha ikki soat ketgan bo'lsa, muammo o'sha yerda.
 */
export function gapMinutes(previousIso: string, currentIso: string): number | null {
  const previous = new Date(previousIso).getTime();
  const current = new Date(currentIso).getTime();
  if (Number.isNaN(previous) || Number.isNaN(current)) return null;
  return Math.max(0, Math.round((current - previous) / 60000));
}

export function gapLabel(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return `+${minutes} daq`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `+${hours} soat` : `+${hours} soat ${rest} daq`;
}

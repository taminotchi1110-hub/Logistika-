/**
 * Buyurtma hayotiy sikli — yagona haqiqat manbai.
 *
 * Bu fayl uchta narsani bir joyda saqlaydi va ular bir-biriga bogʻliq:
 *   1. Qaysi holatdan qaysi holatga oʻtish mumkin
 *   2. Kim oʻtkaza oladi (haydovchi / yuk beruvchi / tizim)
 *   3. Har bir holatda kim kimning telefonini koʻradi va chat ochiqmi
 *
 * NEGA BIR FAYLDA: bu qoidalar bir-biridan ajralsa, "ilovada tugma faol,
 * lekin server rad etadi" yoki "telefon vaqtidan oldin ochilib ketdi"
 * kabi xatolar muqarrar. Mobil ilova ham, WebSocket ham, REST ham
 * shu funksiyalarga tayanadi.
 */

export const ORDER_STATUSES = [
  'ASSIGNED',
  'CONFIRMED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'ARRIVED_AT_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CLOSED',
  'DISPUTED',
  'CANCELLED_BY_SHIPPER',
  'CANCELLED_BY_DRIVER',
  'CANCELLED_BY_ADMIN',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type ActorRole = 'SHIPPER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';

/** Ruxsat etilgan oʻtishlar. Roʻyxatda yoʻq oʻtish — 409. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  ASSIGNED: ['CONFIRMED', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_SHIPPER', 'CANCELLED_BY_ADMIN'],
  CONFIRMED: [
    'EN_ROUTE_TO_PICKUP',
    'CANCELLED_BY_DRIVER',
    'CANCELLED_BY_SHIPPER',
    'CANCELLED_BY_ADMIN',
  ],
  EN_ROUTE_TO_PICKUP: ['ARRIVED_AT_PICKUP', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_ADMIN'],
  ARRIVED_AT_PICKUP: ['LOADED', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_ADMIN'],
  // Yuk ortilgandan keyin bekor qilish faqat admin orqali (nizo rejimi)
  LOADED: ['IN_TRANSIT', 'CANCELLED_BY_ADMIN'],
  IN_TRANSIT: ['ARRIVED_AT_DELIVERY', 'CANCELLED_BY_ADMIN'],
  ARRIVED_AT_DELIVERY: ['DELIVERED', 'CANCELLED_BY_ADMIN'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['CLOSED'],
  DISPUTED: ['COMPLETED', 'CANCELLED_BY_ADMIN'],
  CLOSED: [],
  CANCELLED_BY_SHIPPER: [],
  CANCELLED_BY_DRIVER: [],
  CANCELLED_BY_ADMIN: [],
};

/** Har bir oʻtishni kim boshlashi mumkin. Admin hamma joyda mumkin. */
const TRANSITION_ACTORS: Partial<Record<OrderStatus, readonly ActorRole[]>> = {
  CONFIRMED: ['DRIVER'],
  EN_ROUTE_TO_PICKUP: ['DRIVER'],
  ARRIVED_AT_PICKUP: ['DRIVER', 'SYSTEM'], // SYSTEM = geofence
  LOADED: ['DRIVER'],
  IN_TRANSIT: ['DRIVER'],
  ARRIVED_AT_DELIVERY: ['DRIVER', 'SYSTEM'],
  DELIVERED: ['DRIVER'],
  COMPLETED: ['SHIPPER', 'SYSTEM'], // SYSTEM = 24 soatdan keyin avtomatik
  CLOSED: ['SYSTEM'],
  DISPUTED: ['SHIPPER'],
  CANCELLED_BY_SHIPPER: ['SHIPPER'],
  CANCELLED_BY_DRIVER: ['DRIVER'],
  CANCELLED_BY_ADMIN: ['ADMIN'],
};

/** Buyurtma hali tugamaganmi (haydovchi band hisoblanadi). */
export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'CONFIRMED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'ARRIVED_AT_DELIVERY',
];

export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  'CLOSED',
  'CANCELLED_BY_SHIPPER',
  'CANCELLED_BY_DRIVER',
  'CANCELLED_BY_ADMIN',
];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function canActorTransition(to: OrderStatus, actor: ActorRole): boolean {
  if (actor === 'ADMIN') return true;
  const allowed = TRANSITION_ACTORS[to];
  return allowed ? allowed.includes(actor) : false;
}

/** Holat oʻtishining toʻliq tekshiruvi — sabab bilan. */
export function validateTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: ActorRole,
): { ok: true } | { ok: false; reason: 'INVALID_TRANSITION' | 'ACTOR_NOT_ALLOWED' } {
  if (!canTransition(from, to)) return { ok: false, reason: 'INVALID_TRANSITION' };
  if (!canActorTransition(to, actor)) return { ok: false, reason: 'ACTOR_NOT_ALLOWED' };
  return { ok: true };
}

// =====================================================================
//  KONTAKT KOʻRINISHI
// =====================================================================

/**
 * Telefon raqamlari qaysi holatdan boshlab ochiladi.
 *
 * BIZNES QOIDASI (mijoz talabi):
 *   Haydovchi va yuk beruvchi bir-birining raqamini FAQAT haydovchi yuk
 *   olish nuqtasiga yetib borgandan keyin koʻradi. Unga qadar butun muloqot
 *   platforma ichidagi chat orqali ketadi.
 *
 * NEGA SHUNDAY: raqam erta ochilsa, tomonlar platformani chetlab oʻtib
 * kelishib olishlari oson boʻladi — komissiya ham, nizo himoyasi ham,
 * tracking ham yoʻqoladi. Yetib borish payti esa bitim amalda boshlangan
 * nuqta: bu yerda chetlab oʻtishning maʼnosi qolmaydi, aloqa esa zarur.
 *
 * Yetkazish nuqtasidagi kontakt (koʻpincha uchinchi shaxs — qabul qiluvchi)
 * yuk ortilgandan keyin ochiladi: haydovchi yoʻlga chiqqach kelishi haqida
 * ogohlantirishi kerak.
 */
const PHONE_REVEAL_STATUS: OrderStatus = 'ARRIVED_AT_PICKUP';
const DELIVERY_PHONE_REVEAL_STATUS: OrderStatus = 'LOADED';

/** Holatlarning tartib raqami — "shu bosqichga yetdimi" tekshiruvi uchun. */
const STATUS_ORDER: Partial<Record<OrderStatus, number>> = {
  ASSIGNED: 1,
  CONFIRMED: 2,
  EN_ROUTE_TO_PICKUP: 3,
  ARRIVED_AT_PICKUP: 4,
  LOADED: 5,
  IN_TRANSIT: 6,
  ARRIVED_AT_DELIVERY: 7,
  DELIVERED: 8,
  COMPLETED: 9,
  CLOSED: 10,
  DISPUTED: 8, // DELIVERED bilan bir darajada
};

function reached(status: OrderStatus, milestone: OrderStatus): boolean {
  const current = STATUS_ORDER[status];
  const target = STATUS_ORDER[milestone];
  if (current === undefined || target === undefined) return false;
  return current >= target;
}

export interface ContactVisibility {
  /** Yuk olish nuqtasidagi kontakt telefoni ochiqmi. */
  pickupPhone: boolean;
  /** Yetkazish nuqtasidagi kontakt telefoni ochiqmi. */
  deliveryPhone: boolean;
  /** Hamkorning (haydovchi ↔ yuk beruvchi) telefoni ochiqmi. */
  counterpartyPhone: boolean;
  /** Chat yozish mumkinmi. */
  chatEnabled: boolean;
  /** Chat faqat oʻqish uchunmi (yopilgan buyurtma). */
  chatReadOnly: boolean;
  /**
   * Raqam hali yopiq, lekin favqulodda ochish tugmasi koʻrsatilsinmi.
   * Mobil ilova shu bayroqqa qarab "Bogʻlana olmayapman" tugmasini chiqaradi.
   */
  emergencyRevealAvailable: boolean;
}

/**
 * Buyurtma holatiga qarab kontakt koʻrinishini hisoblaydi.
 *
 * `emergencyRevealed` — admin yoki foydalanuvchi favqulodda ochgan boʻlsa
 * (sabab bilan, audit'ga yozilgan holda) raqam muddatidan oldin ochiladi.
 */
export function contactVisibility(
  status: OrderStatus,
  options: { emergencyRevealed?: boolean } = {},
): ContactVisibility {
  const cancelled = isTerminal(status) && status !== 'CLOSED';
  const emergency = options.emergencyRevealed === true;

  // Bekor qilingan buyurtmada kontakt ochilmaydi va chat yopiladi
  if (cancelled) {
    return {
      pickupPhone: false,
      deliveryPhone: false,
      counterpartyPhone: false,
      chatEnabled: false,
      chatReadOnly: true,
      emergencyRevealAvailable: false,
    };
  }

  const atPickup = emergency || reached(status, PHONE_REVEAL_STATUS);
  const afterLoading = emergency || reached(status, DELIVERY_PHONE_REVEAL_STATUS);

  return {
    pickupPhone: atPickup,
    deliveryPhone: afterLoading,
    counterpartyPhone: atPickup,
    // Chat buyurtma qabul qilingan payti ochiladi (ASSIGNED) va yopilgunicha ishlaydi
    chatEnabled: status !== 'CLOSED',
    chatReadOnly: status === 'CLOSED',
    emergencyRevealAvailable: !atPickup,
  };
}

/** Mobil ilova uchun tushunarli status matni (uz). */
export const STATUS_LABEL_UZ: Record<OrderStatus, string> = {
  ASSIGNED: 'Haydovchi tanlandi',
  CONFIRMED: 'Buyurtma tasdiqlandi',
  EN_ROUTE_TO_PICKUP: 'Haydovchi yoʻlga chiqdi',
  ARRIVED_AT_PICKUP: 'Yuk olish nuqtasida',
  LOADED: 'Yuk ortildi',
  IN_TRANSIT: 'Yoʻlda',
  ARRIVED_AT_DELIVERY: 'Manzilga yaqinlashdi',
  DELIVERED: 'Yetkazib berildi',
  COMPLETED: 'Tasdiqlandi',
  CLOSED: 'Yopildi',
  DISPUTED: 'Nizo',
  CANCELLED_BY_SHIPPER: 'Yuk beruvchi bekor qildi',
  CANCELLED_BY_DRIVER: 'Haydovchi bekor qildi',
  CANCELLED_BY_ADMIN: 'Administrator bekor qildi',
};

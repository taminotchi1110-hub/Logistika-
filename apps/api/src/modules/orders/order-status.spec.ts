import {
  ACTIVE_STATUSES,
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  canTransition,
  contactVisibility,
  isTerminal,
  validateTransition,
  type OrderStatus,
} from './order-status';

describe('Buyurtma holatlari — oʻtishlar', () => {
  it('toʻgʻri zanjir boshidan oxirigacha oʻtadi', () => {
    const chain: OrderStatus[] = [
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
    ];

    for (let i = 0; i < chain.length - 1; i++) {
      expect(canTransition(chain[i], chain[i + 1])).toBe(true);
    }
  });

  it('bosqichni oʻtkazib yuborib boʻlmaydi', () => {
    expect(canTransition('CONFIRMED', 'LOADED')).toBe(false);
    expect(canTransition('ASSIGNED', 'DELIVERED')).toBe(false);
    expect(canTransition('EN_ROUTE_TO_PICKUP', 'IN_TRANSIT')).toBe(false);
  });

  it('orqaga qaytish mumkin emas', () => {
    expect(canTransition('LOADED', 'ARRIVED_AT_PICKUP')).toBe(false);
    expect(canTransition('DELIVERED', 'IN_TRANSIT')).toBe(false);
    expect(canTransition('COMPLETED', 'DELIVERED')).toBe(false);
  });

  it('yakuniy holatlardan hech qayerga oʻtilmaydi', () => {
    for (const status of ORDER_STATUSES) {
      if (isTerminal(status)) {
        expect(ALLOWED_TRANSITIONS[status]).toHaveLength(0);
      }
    }
  });

  it('yuk ortilgandan keyin faqat admin bekor qila oladi', () => {
    expect(canTransition('LOADED', 'CANCELLED_BY_DRIVER')).toBe(false);
    expect(canTransition('LOADED', 'CANCELLED_BY_SHIPPER')).toBe(false);
    expect(canTransition('LOADED', 'CANCELLED_BY_ADMIN')).toBe(true);
  });

  it('har bir holat oʻtish jadvalida bor', () => {
    for (const status of ORDER_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('Buyurtma holatlari — kim oʻzgartira oladi', () => {
  it('haydovchi yoʻlga chiqishni oʻzi belgilaydi', () => {
    expect(validateTransition('CONFIRMED', 'EN_ROUTE_TO_PICKUP', 'DRIVER')).toEqual({ ok: true });
  });

  it('yuk beruvchi haydovchi nomidan status qoʻya olmaydi', () => {
    expect(validateTransition('CONFIRMED', 'EN_ROUTE_TO_PICKUP', 'SHIPPER')).toEqual({
      ok: false,
      reason: 'ACTOR_NOT_ALLOWED',
    });
  });

  it('yetkazilganini faqat haydovchi belgilaydi, tasdiqlashni esa klient', () => {
    expect(validateTransition('ARRIVED_AT_DELIVERY', 'DELIVERED', 'DRIVER')).toEqual({ ok: true });
    expect(validateTransition('DELIVERED', 'COMPLETED', 'SHIPPER')).toEqual({ ok: true });
    expect(validateTransition('DELIVERED', 'COMPLETED', 'DRIVER')).toEqual({
      ok: false,
      reason: 'ACTOR_NOT_ALLOWED',
    });
  });

  it('tizim 24 soatdan keyin oʻzi tasdiqlay oladi', () => {
    expect(validateTransition('DELIVERED', 'COMPLETED', 'SYSTEM')).toEqual({ ok: true });
  });

  it('geofence yetib kelganini belgilay oladi', () => {
    expect(validateTransition('EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'SYSTEM')).toEqual({
      ok: true,
    });
  });

  it('admin istalgan ruxsat etilgan oʻtishni bajaradi', () => {
    expect(validateTransition('LOADED', 'IN_TRANSIT', 'ADMIN')).toEqual({ ok: true });
  });

  it('admin ham mantiqan mumkin boʻlmagan oʻtishni qila olmaydi', () => {
    expect(validateTransition('ASSIGNED', 'DELIVERED', 'ADMIN')).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('faol holatlar roʻyxati tasdiqlangandan yetkazilgungacha', () => {
    expect(ACTIVE_STATUSES).toContain('CONFIRMED');
    expect(ACTIVE_STATUSES).toContain('ARRIVED_AT_DELIVERY');
    expect(ACTIVE_STATUSES).not.toContain('ASSIGNED');
    expect(ACTIVE_STATUSES).not.toContain('DELIVERED');
  });
});

describe('Kontakt koʻrinishi — asosiy biznes qoidasi', () => {
  it('yuk olish nuqtasiga YETIB BORGUNCHA telefonlar yopiq', () => {
    for (const status of ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE_TO_PICKUP'] as OrderStatus[]) {
      const v = contactVisibility(status);
      expect(v.pickupPhone).toBe(false);
      expect(v.counterpartyPhone).toBe(false);
      expect(v.deliveryPhone).toBe(false);
    }
  });

  it('yetib borgan paytdan telefon ochiladi', () => {
    const v = contactVisibility('ARRIVED_AT_PICKUP');
    expect(v.pickupPhone).toBe(true);
    expect(v.counterpartyPhone).toBe(true);
  });

  it('yetib borgandan keyingi barcha holatlarda ochiq qoladi', () => {
    for (const status of [
      'LOADED',
      'IN_TRANSIT',
      'ARRIVED_AT_DELIVERY',
      'DELIVERED',
      'COMPLETED',
      'CLOSED',
    ] as OrderStatus[]) {
      expect(contactVisibility(status).counterpartyPhone).toBe(true);
    }
  });

  it('yetkazish nuqtasidagi kontakt faqat yuk ortilgandan keyin', () => {
    expect(contactVisibility('ARRIVED_AT_PICKUP').deliveryPhone).toBe(false);
    expect(contactVisibility('LOADED').deliveryPhone).toBe(true);
    expect(contactVisibility('IN_TRANSIT').deliveryPhone).toBe(true);
  });

  it('chat buyurtma qabul qilingan paytdan ishlaydi', () => {
    expect(contactVisibility('ASSIGNED').chatEnabled).toBe(true);
    expect(contactVisibility('CONFIRMED').chatEnabled).toBe(true);
    expect(contactVisibility('EN_ROUTE_TO_PICKUP').chatEnabled).toBe(true);
  });

  it('yopilgan buyurtmada chat faqat oʻqish uchun', () => {
    const v = contactVisibility('CLOSED');
    expect(v.chatEnabled).toBe(false);
    expect(v.chatReadOnly).toBe(true);
  });

  it('bekor qilingan buyurtmada telefon ochilmaydi va chat yopiladi', () => {
    for (const status of [
      'CANCELLED_BY_SHIPPER',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_ADMIN',
    ] as OrderStatus[]) {
      const v = contactVisibility(status);
      expect(v.counterpartyPhone).toBe(false);
      expect(v.chatEnabled).toBe(false);
      expect(v.chatReadOnly).toBe(true);
    }
  });

  it('favqulodda ochish tugmasi faqat raqam yopiq boʻlganda koʻrinadi', () => {
    expect(contactVisibility('CONFIRMED').emergencyRevealAvailable).toBe(true);
    expect(contactVisibility('ARRIVED_AT_PICKUP').emergencyRevealAvailable).toBe(false);
  });

  it('favqulodda ochilgan boʻlsa raqam muddatidan oldin koʻrinadi', () => {
    const v = contactVisibility('EN_ROUTE_TO_PICKUP', { emergencyRevealed: true });
    expect(v.pickupPhone).toBe(true);
    expect(v.counterpartyPhone).toBe(true);
    expect(v.emergencyRevealAvailable).toBe(false);
  });

  it('favqulodda ochish bekor qilingan buyurtmada ishlamaydi', () => {
    const v = contactVisibility('CANCELLED_BY_DRIVER', { emergencyRevealed: true });
    expect(v.counterpartyPhone).toBe(false);
  });

  it('nizo holatida raqam ochiq qoladi (tomonlar hal qilishi kerak)', () => {
    expect(contactVisibility('DISPUTED').counterpartyPhone).toBe(true);
  });
});

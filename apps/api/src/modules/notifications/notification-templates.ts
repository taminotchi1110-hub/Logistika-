import type { DocumentType, LangCode } from '@/infra/database/database.types';
import { STATUS_LABEL_UZ, type OrderStatus } from '@/modules/orders/order-status';

/**
 * Bildirishnoma matnlari — UCH TILDA, bitta joyda.
 *
 * NEGA SHABLON (tayyor matn emas): ilgari har bir servis matnni o'zi
 * o'zbekcha yozardi va ruscha interfeysdagi foydalanuvchi o'zbekcha push
 * olardi. Endi servis faqat NIMA bo'lganini aytadi — `tpl(kalit,
 * parametrlar)` — matn esa qabul qiluvchining tilida shu yerda yig'iladi
 * (`NotificationsService.notify`, til `users.lang` dan).
 *
 * Yangi bildirishnoma qo'shilganda uchala til ham yoziladi:
 * `notification-templates.spec.ts` bo'sh yoki unutilgan tarjimani ushlaydi.
 */

export interface NotificationText {
  title: string;
  body: string;
}

type Localized = Record<LangCode, NotificationText>;

/** Tiyin: bazadan satr, hisobdan bigint, DTO'dan son bo'lib keladi. */
type Money = bigint | string | number;

/** Viloyat nomi uch tilda; tarjima bo'lmasa o'zbekchasi olinadi. */
interface Names {
  uz: string;
  ru?: string | null;
  en?: string | null;
}

// =================================================================
//  Formatlash
// =================================================================

const SOUM: Record<LangCode, string> = { uz: 'soʻm', ru: 'сум', en: 'UZS' };

function toBig(value: Money): bigint {
  if (typeof value === 'bigint') return value;
  return BigInt(typeof value === 'number' ? Math.round(value) : value);
}

/** `24000000` tiyin → "240 000 soʻm" / "240 000 сум" / "240 000 UZS". */
export function formatMoney(tiyin: Money, lang: LangCode): string {
  const value = toBig(tiyin);
  const soum = (value < 0n ? -value : value) / 100n;
  // Uch xonalab probel bilan — O'zbekistonda ham, Rossiyada ham shunday
  const grouped = soum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${value < 0n ? '−' : ''}${grouped} ${SOUM[lang]}`;
}

/** Qisqa shakl push qatoriga sig'ishi uchun: "2.4 mln soʻm", "240K UZS". */
export function formatMoneyShort(tiyin: Money, lang: LangCode): string {
  const soum = Number(toBig(tiyin) / 100n);
  const [thousand, million] = { uz: ['ming', 'mln'], ru: ['тыс.', 'млн'], en: ['K', 'M'] }[lang];
  // Inglizchada "240K" — birlik songa yopishadi
  const gap = lang === 'en' ? '' : ' ';
  const trim = (n: number) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1));

  if (Math.abs(soum) >= 1_000_000) return `${trim(soum / 1_000_000)}${gap}${million} ${SOUM[lang]}`;
  if (Math.abs(soum) >= 1_000) return `${trim(soum / 1_000)}${gap}${thousand} ${SOUM[lang]}`;
  return `${soum} ${SOUM[lang]}`;
}

const pick = (names: Names, lang: LangCode): string => names[lang] || names.uz;

// =================================================================
//  Nomlar
// =================================================================

/** Mobil ilova yorliqlari bilan bir xil (`app_*.arb`, `orderStatus*`). */
export const STATUS_LABEL: Record<LangCode, Record<OrderStatus, string>> = {
  uz: STATUS_LABEL_UZ,
  ru: {
    ASSIGNED: 'Водитель выбран',
    CONFIRMED: 'Заказ подтверждён',
    EN_ROUTE_TO_PICKUP: 'Водитель едет на погрузку',
    ARRIVED_AT_PICKUP: 'На месте погрузки',
    LOADED: 'Груз загружен',
    IN_TRANSIT: 'В пути',
    ARRIVED_AT_DELIVERY: 'Прибыл к получателю',
    DELIVERED: 'Груз сдан',
    COMPLETED: 'Приёмка подтверждена',
    CLOSED: 'Закрыт',
    DISPUTED: 'Спор',
    CANCELLED_BY_SHIPPER: 'Отменён грузоотправителем',
    CANCELLED_BY_DRIVER: 'Отменён водителем',
    CANCELLED_BY_ADMIN: 'Отменён администратором',
  },
  en: {
    ASSIGNED: 'Driver assigned',
    CONFIRMED: 'Order confirmed',
    EN_ROUTE_TO_PICKUP: 'Driver on the way',
    ARRIVED_AT_PICKUP: 'At pickup point',
    LOADED: 'Cargo loaded',
    IN_TRANSIT: 'In transit',
    ARRIVED_AT_DELIVERY: 'At delivery point',
    DELIVERED: 'Delivered',
    COMPLETED: 'Delivery accepted',
    CLOSED: 'Closed',
    DISPUTED: 'Disputed',
    CANCELLED_BY_SHIPPER: 'Cancelled by shipper',
    CANCELLED_BY_DRIVER: 'Cancelled by driver',
    CANCELLED_BY_ADMIN: 'Cancelled by admin',
  },
};

const DOCUMENT_LABEL: Record<LangCode, Record<DocumentType, string>> = {
  uz: {
    PASSPORT: 'Pasport',
    ID_CARD: 'ID karta',
    DRIVER_LICENSE: 'Haydovchilik guvohnomasi',
    VEHICLE_REG: 'Texnik pasport',
    INSURANCE: 'Sugʻurta',
    CARGO_DOC: 'Yuk hujjati',
    WAYBILL: 'Yoʻl varaqasi',
    CONTRACT: 'Shartnoma',
    POD: 'Yukni topshirish dalolatnomasi',
    POP: 'Yukni olish dalolatnomasi',
    SIGNATURE: 'Imzo',
    OTHER: 'Boshqa hujjat',
  },
  ru: {
    PASSPORT: 'Паспорт',
    ID_CARD: 'ID-карта',
    DRIVER_LICENSE: 'Водительское удостоверение',
    VEHICLE_REG: 'Техпаспорт',
    INSURANCE: 'Страховка',
    CARGO_DOC: 'Документ на груз',
    WAYBILL: 'Путевой лист',
    CONTRACT: 'Договор',
    POD: 'Акт сдачи груза',
    POP: 'Акт приёма груза',
    SIGNATURE: 'Подпись',
    OTHER: 'Другой документ',
  },
  en: {
    PASSPORT: 'Passport',
    ID_CARD: 'ID card',
    DRIVER_LICENSE: "Driver's license",
    VEHICLE_REG: 'Vehicle registration',
    INSURANCE: 'Insurance',
    CARGO_DOC: 'Cargo document',
    WAYBILL: 'Waybill',
    CONTRACT: 'Contract',
    POD: 'Proof of delivery',
    POP: 'Proof of pickup',
    SIGNATURE: 'Signature',
    OTHER: 'Other document',
  },
};

/** Ilgari matnga xom kod tushardi: "PASSPORT tekshiruvdan oʻtdi". */
const documentName = (type: string, lang: LangCode): string =>
  DOCUMENT_LABEL[lang][type as DocumentType] ?? DOCUMENT_LABEL[lang].OTHER;

const NO_REASON: Record<LangCode, string> = {
  uz: 'sabab koʻrsatilmagan',
  ru: 'причина не указана',
  en: 'no reason given',
};

const reasonOr = (reason: string | null | undefined, lang: LangCode): string =>
  reason?.trim() || NO_REASON[lang];

// =================================================================
//  Shablonlar
// =================================================================

export const TEMPLATES = {
  // ------------------------------------------------------------ takliflar
  'offer.received': (p: { driverName: string; rating: number; amountTiyin: Money }) => {
    const line = (lang: LangCode) =>
      `${p.driverName} · ⭐${p.rating.toFixed(1)} · ${formatMoney(p.amountTiyin, lang)}`;
    return {
      uz: { title: 'Yangi taklif', body: line('uz') },
      ru: { title: 'Новое предложение', body: line('ru') },
      en: { title: 'New offer', body: line('en') },
    };
  },

  'offer.accepted': () => ({
    uz: { title: 'Taklifingiz qabul qilindi', body: 'Buyurtmani tasdiqlang va yoʻlga chiqing. Chat ochildi.' },
    ru: { title: 'Ваше предложение принято', body: 'Подтвердите заказ и выезжайте. Чат открыт.' },
    en: { title: 'Your offer was accepted', body: 'Confirm the order and set off. The chat is open.' },
  }),

  'offer.rejected': (p: { loadTitle: string }) => ({
    uz: { title: 'Taklif rad etildi', body: p.loadTitle },
    ru: { title: 'Предложение отклонено', body: p.loadTitle },
    en: { title: 'Offer declined', body: p.loadTitle },
  }),

  // ------------------------------------------------------------ buyurtma
  'order.status': (p: { status: OrderStatus; role: 'SHIPPER' | 'DRIVER' }) => {
    // Yuk olish nuqtasida telefon ochiladi — bu eng muhim xabar
    const atPickup = p.status === 'ARRIVED_AT_PICKUP';
    const shipper = p.role === 'SHIPPER';
    return {
      uz: {
        title: STATUS_LABEL.uz[p.status],
        body: atPickup
          ? 'Haydovchi yuk olish nuqtasida. Telefon raqamlari endi ochiq.'
          : shipper
            ? 'Buyurtmangiz holati oʻzgardi'
            : 'Buyurtma holati yangilandi',
      },
      ru: {
        title: STATUS_LABEL.ru[p.status],
        body: atPickup
          ? 'Водитель на месте погрузки. Номера телефонов теперь открыты.'
          : shipper
            ? 'Статус вашего заказа изменился'
            : 'Статус заказа обновлён',
      },
      en: {
        title: STATUS_LABEL.en[p.status],
        body: atPickup
          ? 'The driver is at the pickup point. Phone numbers are now visible.'
          : shipper
            ? 'Your order status has changed'
            : 'Order status updated',
      },
    };
  },

  'contacts.revealed': (p: { reason: string }) => ({
    uz: { title: 'Telefon raqamlari ochildi', body: `Sabab: ${p.reason}` },
    ru: { title: 'Номера телефонов открыты', body: `Причина: ${p.reason}` },
    en: { title: 'Phone numbers revealed', body: `Reason: ${p.reason}` },
  }),

  // ------------------------------------------------------------ matching
  'load.matched': (p: {
    from: Names;
    to: Names;
    title: string;
    weightKg: number;
    priceTiyin: Money | null;
    score: number;
  }) => {
    const route = (lang: LangCode) => `${pick(p.from, lang)} → ${pick(p.to, lang)}`;
    const body = (lang: LangCode, ton: string, negotiable: string, match: string) =>
      [
        p.title,
        `${(p.weightKg / 1000).toFixed(1)} ${ton}`,
        p.priceTiyin === null ? negotiable : formatMoneyShort(p.priceTiyin, lang),
        match,
      ].join(' · ');
    return {
      uz: { title: route('uz'), body: body('uz', 't', 'Kelishuv asosida', `${p.score}% mos`) },
      ru: { title: route('ru'), body: body('ru', 'т', 'Договорная', `совпадение ${p.score}%`) },
      en: { title: route('en'), body: body('en', 't', 'Negotiable', `${p.score}% match`) },
    };
  },

  // ------------------------------------------------------------ pul
  'wallet.topup': (p: { amountTiyin: Money }) => ({
    uz: { title: 'Hamyon toʻldirildi', body: `${formatMoney(p.amountTiyin, 'uz')} hisobingizga tushdi` },
    ru: { title: 'Кошелёк пополнен', body: `${formatMoney(p.amountTiyin, 'ru')} зачислено на счёт` },
    en: { title: 'Wallet topped up', body: `${formatMoney(p.amountTiyin, 'en')} added to your balance` },
  }),

  'escrow.released': (p: { amountTiyin: Money }) => ({
    uz: { title: 'Toʻlov hisobingizga tushdi', body: `${formatMoney(p.amountTiyin, 'uz')} hamyoningizga oʻtkazildi` },
    ru: { title: 'Оплата поступила', body: `${formatMoney(p.amountTiyin, 'ru')} переведено в кошелёк` },
    en: { title: 'Payment received', body: `${formatMoney(p.amountTiyin, 'en')} transferred to your wallet` },
  }),

  /** Naqd buyurtma: pul haydovchining qo'lida, platforma ulushi yechiladi. */
  'commission.charged': (p: { amountTiyin: Money }) => ({
    uz: {
      title: 'Komissiya yechildi',
      body: `Naqd buyurtma uchun platforma komissiyasi: ${formatMoney(p.amountTiyin, 'uz')}`,
    },
    ru: {
      title: 'Списана комиссия',
      body: `Комиссия платформы за заказ с оплатой наличными: ${formatMoney(p.amountTiyin, 'ru')}`,
    },
    en: {
      title: 'Commission charged',
      body: `Platform fee for a cash order: ${formatMoney(p.amountTiyin, 'en')}`,
    },
  }),

  'payout.completed': (p: { amountTiyin: Money; cardMask: string | null }) => {
    // Karta niqobi bo'lmasa oxirida osilib qolgan "—" ko'rinmasin
    const line = (lang: LangCode) =>
      p.cardMask ? `${formatMoney(p.amountTiyin, lang)} — ${p.cardMask}` : formatMoney(p.amountTiyin, lang);
    return {
      uz: { title: 'Pul kartangizga oʻtkazildi', body: line('uz') },
      ru: { title: 'Деньги переведены на карту', body: line('ru') },
      en: { title: 'Money sent to your card', body: line('en') },
    };
  },

  'payout.rejected': (p: { amountTiyin: Money; reason: string }) => ({
    uz: {
      title: 'Yechish soʻrovi rad etildi',
      body: `${formatMoney(p.amountTiyin, 'uz')} hamyoningizga qaytarildi. Sabab: ${p.reason}`,
    },
    ru: {
      title: 'Заявка на вывод отклонена',
      body: `${formatMoney(p.amountTiyin, 'ru')} возвращены в кошелёк. Причина: ${p.reason}`,
    },
    en: {
      title: 'Withdrawal request rejected',
      body: `${formatMoney(p.amountTiyin, 'en')} returned to your wallet. Reason: ${p.reason}`,
    },
  }),

  // ------------------------------------------------------------ baho
  'rating.prompt': () => ({
    uz: { title: 'Sizga baho berildi', body: 'Hamkoringiz baho qoldirdi. Siz ham baho bersangiz, ikkalasi ochiladi.' },
    ru: { title: 'Вам поставили оценку', body: 'Партнёр оставил оценку. Оцените его — и обе оценки откроются.' },
    en: { title: 'You received a rating', body: 'Your partner left a rating. Rate them too and both will be revealed.' },
  }),

  'rating.revealed': (p: { score: number }) => ({
    uz: { title: `Sizga ${p.score} ball berildi`, body: 'Baholar ochildi — hamkoringizning fikrini koʻrishingiz mumkin' },
    ru: { title: `Вам поставили ${p.score} из 5`, body: 'Оценки открыты — можно посмотреть отзыв партнёра' },
    en: { title: `You were rated ${p.score}/5`, body: "Ratings are revealed — you can see your partner's feedback" },
  }),

  // ------------------------------------------------------------ tekshiruv
  'document.approved': (p: { document: string }) => ({
    uz: { title: 'Hujjat tasdiqlandi', body: `${documentName(p.document, 'uz')} tekshiruvdan oʻtdi` },
    ru: { title: 'Документ подтверждён', body: `${documentName(p.document, 'ru')}: проверка пройдена` },
    en: { title: 'Document approved', body: `${documentName(p.document, 'en')} passed verification` },
  }),

  'document.rejected': (p: { document: string; reason?: string | null }) => ({
    uz: {
      title: 'Hujjat rad etildi',
      body: `${documentName(p.document, 'uz')} rad etildi: ${reasonOr(p.reason, 'uz')}`,
    },
    ru: {
      title: 'Документ отклонён',
      body: `${documentName(p.document, 'ru')}: отклонено — ${reasonOr(p.reason, 'ru')}`,
    },
    en: {
      title: 'Document rejected',
      body: `${documentName(p.document, 'en')} was rejected: ${reasonOr(p.reason, 'en')}`,
    },
  }),

  'driver.verified': () => ({
    uz: { title: 'Verifikatsiya yakunlandi', body: 'Endi yuklarga taklif yuborishingiz mumkin' },
    ru: { title: 'Проверка пройдена', body: 'Теперь вы можете отправлять предложения на грузы' },
    en: { title: 'Verification complete', body: 'You can now send offers on loads' },
  }),

  'driver.rejected': (p: { reason?: string | null }) => ({
    uz: { title: 'Verifikatsiya rad etildi', body: `Sabab: ${reasonOr(p.reason, 'uz')}` },
    ru: { title: 'Проверка не пройдена', body: `Причина: ${reasonOr(p.reason, 'ru')}` },
    en: { title: 'Verification rejected', body: `Reason: ${reasonOr(p.reason, 'en')}` },
  }),

  'vehicle.verified': (p: { plate: string }) => ({
    uz: { title: 'Transport tasdiqlandi', body: p.plate },
    ru: { title: 'Транспорт подтверждён', body: p.plate },
    en: { title: 'Vehicle verified', body: p.plate },
  }),

  'vehicle.rejected': (p: { plate: string; reason?: string | null }) => ({
    uz: { title: 'Transport rad etildi', body: `${p.plate} — ${reasonOr(p.reason, 'uz')}` },
    ru: { title: 'Транспорт отклонён', body: `${p.plate} — ${reasonOr(p.reason, 'ru')}` },
    en: { title: 'Vehicle rejected', body: `${p.plate} — ${reasonOr(p.reason, 'en')}` },
  }),
} satisfies Record<string, (params: never) => Localized>;

export type TemplateKey = keyof typeof TEMPLATES;

/** Parametrsiz shablon uchun `{}`. */
export type TemplateParams<K extends TemplateKey> =
  Parameters<(typeof TEMPLATES)[K]> extends [infer P] ? P : Record<string, never>;

/** Kalit va unga MOS parametrlar — noto'g'ri juftlik kompilyatsiyada ushlanadi. */
export type TemplateCall = { [K in TemplateKey]: { key: K; params: TemplateParams<K> } }[TemplateKey];

/** Servislar shu bilan chaqiradi: `template: tpl('offer.accepted', {})`. */
export function tpl<K extends TemplateKey>(key: K, params: TemplateParams<K>): TemplateCall {
  // TS umumiy `K` ni birlashma a'zosi bilan bog'lay olmaydi — imzo buni kafolatlaydi
  return { key, params } as TemplateCall;
}

export function renderTemplate(call: TemplateCall, lang: LangCode): NotificationText {
  const build = TEMPLATES[call.key] as (params: unknown) => Localized;
  return build(call.params)[lang];
}

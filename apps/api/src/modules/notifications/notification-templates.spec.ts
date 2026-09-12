import type { LangCode } from '@/infra/database/database.types';
import { STATUS_LABEL_UZ, type OrderStatus } from '@/modules/orders/order-status';

import {
  formatMoney,
  formatMoneyShort,
  renderTemplate,
  TEMPLATES,
  tpl,
  type TemplateCall,
  type TemplateKey,
  type TemplateParams,
} from './notification-templates';

const LANGS: LangCode[] = ['uz', 'ru', 'en'];

/**
 * Har bir shablon uchun namuna parametrlar.
 *
 * Tur MAPPED: yangi shablon qo'shilib, bu yerga namuna yozilmasa —
 * kompilyatsiya xatosi. Shunday qilib hech bir shablon testsiz qolmaydi.
 */
const SAMPLES: { [K in TemplateKey]: TemplateParams<K> } = {
  'offer.received': { driverName: 'Anvar Karimov', rating: 4.8, amountTiyin: 240_000_000 },
  'offer.accepted': {},
  'offer.rejected': { loadTitle: 'Mebel — 5 ta shkaf' },
  'order.status': { status: 'LOADED', role: 'SHIPPER' },
  'contacts.revealed': { reason: 'Manzilni topa olmayapman' },
  'load.matched': {
    from: { uz: 'Toshkent', ru: 'Ташкент', en: 'Tashkent' },
    to: { uz: 'Samarqand', ru: 'Самарканд', en: 'Samarkand' },
    title: 'Mebel',
    weightKg: 4000,
    priceTiyin: '240000000',
    score: 87,
  },
  'wallet.topup': { amountTiyin: 50_000_000n },
  'escrow.released': { amountTiyin: 192_000_000n },
  'commission.charged': { amountTiyin: 8_000_000n },
  'payout.completed': { amountTiyin: 20_000_000n, cardMask: '8600 **** **** 1234' },
  'payout.rejected': { amountTiyin: 20_000_000n, reason: 'Karta bloklangan' },
  'rating.prompt': {},
  'rating.revealed': { score: 5 },
  'document.approved': { document: 'PASSPORT' },
  'document.rejected': { document: 'DRIVER_LICENSE', reason: 'Rasm xira' },
  'driver.verified': {},
  'driver.rejected': { reason: 'Hujjatlar toʻliq emas' },
  'vehicle.verified': { plate: '01 A 123 BC' },
  'vehicle.rejected': { plate: '01 A 123 BC', reason: 'Texnik pasport muddati oʻtgan' },
};

const KEYS = Object.keys(TEMPLATES) as TemplateKey[];
const render = (key: TemplateKey, lang: LangCode) =>
  renderTemplate({ key, params: SAMPLES[key] } as TemplateCall, lang);

describe('bildirishnoma shablonlari', () => {
  it('★ HAR BIR SHABLON UCH TILDA TOʻLIQ', () => {
    for (const key of KEYS) {
      for (const lang of LANGS) {
        const text = render(key, lang);
        expect(text.title.trim()).not.toBe('');
        expect(text.body.trim()).not.toBe('');
        // Unutilgan parametr matnga "undefined" boʻlib tushadi
        expect(`${text.title} ${text.body}`).not.toMatch(/undefined|null|NaN|\[object/);
      }
    }
  });

  it('★ RUSCHA VA INGLIZCHA SARLAVHA OʻZBEKCHANI TAKRORLAMAYDI', () => {
    // Tarjima unutilsa foydalanuvchi tilidan qatʼi nazar oʻzbekcha oladi —
    // bu shablonlarga oʻtishdan oldingi xato edi
    for (const key of KEYS) {
      const uz = render(key, 'uz').title;
      expect(render(key, 'ru').title).not.toBe(uz);
      expect(render(key, 'en').title).not.toBe(uz);
    }
  });

  it('★ HUJJAT NOMI XOM KOD EMAS', () => {
    const uz = renderTemplate(tpl('document.approved', { document: 'PASSPORT' }), 'uz');
    expect(uz.body).toBe('Pasport tekshiruvdan oʻtdi');
    expect(uz.body).not.toContain('PASSPORT');

    // Server yangi tur qoʻshsa — umumiy nom, kod emas
    const unknown = renderTemplate(tpl('document.approved', { document: 'NEW_KIND' }), 'ru');
    expect(unknown.body).toContain('Другой документ');
  });

  it('sabab koʻrsatilmasa — shu aytiladi', () => {
    expect(renderTemplate(tpl('driver.rejected', { reason: null }), 'uz').body).toBe('Sabab: sabab koʻrsatilmagan');
    expect(renderTemplate(tpl('vehicle.rejected', { plate: '01A', reason: '  ' }), 'ru').body).toBe(
      '01A — причина не указана',
    );
  });

  it('★ HAR BIR BUYURTMA HOLATI UCH TILDA VA TAKRORLANMAYDI', () => {
    const statuses = Object.keys(STATUS_LABEL_UZ) as OrderStatus[];
    for (const lang of LANGS) {
      const titles = statuses.map(
        (status) => renderTemplate(tpl('order.status', { status, role: 'DRIVER' }), lang).title,
      );
      expect(new Set(titles).size).toBe(statuses.length);
    }
  });

  it('yuk olish nuqtasida telefon ochilgani aytiladi', () => {
    const text = renderTemplate(tpl('order.status', { status: 'ARRIVED_AT_PICKUP', role: 'DRIVER' }), 'ru');
    expect(text.body).toContain('Номера телефонов');
  });

  it('★ MATCHING: VILOYAT NOMI VA NARX QABUL QILUVCHI TILIDA', () => {
    const ru = renderTemplate(tpl('load.matched', SAMPLES['load.matched']), 'ru');
    expect(ru.title).toBe('Ташкент → Самарканд');
    expect(ru.body).toBe('Mebel · 4.0 т · 2.4 млн сум · совпадение 87%');

    const en = renderTemplate(tpl('load.matched', { ...SAMPLES['load.matched'], priceTiyin: null }), 'en');
    expect(en.body).toBe('Mebel · 4.0 t · Negotiable · 87% match');
  });

  it('tarjimasiz viloyat — oʻzbekcha nom', () => {
    const text = renderTemplate(
      tpl('load.matched', { ...SAMPLES['load.matched'], from: { uz: 'Navoiy', ru: null } }),
      'ru',
    );
    expect(text.title).toBe('Navoiy → Самарканд');
  });
});

describe('pul formati', () => {
  it('★ VALYUTA NOMI TILGA MOS', () => {
    expect(formatMoney(24_000_000n, 'uz')).toBe('240 000 soʻm');
    expect(formatMoney('24000000', 'ru')).toBe('240 000 сум');
    expect(formatMoney(24_000_000, 'en')).toBe('240 000 UZS');
  });

  it('manfiy summa minus belgisi bilan', () => {
    expect(formatMoney(-800_000n, 'uz')).toBe('−8 000 soʻm');
  });

  it('qisqa shakl', () => {
    expect(formatMoneyShort(240_000_000n, 'uz')).toBe('2.4 mln soʻm');
    expect(formatMoneyShort(24_000_000n, 'ru')).toBe('240 тыс. сум');
    expect(formatMoneyShort(24_000_000n, 'en')).toBe('240K UZS');
    expect(formatMoneyShort(50_000n, 'uz')).toBe('500 soʻm');
  });
});

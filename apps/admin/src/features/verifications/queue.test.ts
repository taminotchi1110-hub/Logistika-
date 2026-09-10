import { describe, expect, it } from 'vitest';

import { nextAfterRemoval, reviewPath, toQueue, type QueueResponse } from './queue';

/**
 * Navbat mantiqi.
 *
 * Bu ekranning yuragi: uch ro'yxat bitta FIFO navbatga qo'shiladi va
 * qarordan keyin keyingisi o'zi tanlanadi. Xato bo'lsa operator
 * elementlarni o'tkazib yuboradi yoki noto'g'ri obyektga qaror beradi.
 */

const person = { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901112233' };

function response(overrides: Partial<QueueResponse> = {}): QueueResponse {
  return {
    documents: [],
    drivers: [],
    vehicles: [],
    total: 0,
    ...overrides,
  };
}

describe('toQueue', () => {
  it('★ UCH ROʻYXAT BITTA NAVBATGA QOʻSHILADI', () => {
    const items = toQueue(
      response({
        documents: [
          {
            ...person,
            id: 'd-1',
            type: 'PASSPORT',
            ownerType: 'USER',
            ownerId: 'u-1',
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ],
        drivers: [
          {
            ...person,
            userId: 'u-2',
            licenseCategories: ['B', 'C'],
            experienceYears: 5,
            createdAt: '2026-09-01T09:00:00.000Z',
          },
        ],
        vehicles: [
          {
            ...person,
            id: 'v-1',
            brand: 'MAN',
            model: 'TGX',
            plateNumber: '01A123BC',
            capacityKg: 5000,
            createdAt: '2026-09-01T11:00:00.000Z',
          },
        ],
      }),
    );

    expect(items).toHaveLength(3);
    // FIFO: eng eskisi birinchi. Operator "qaysi turni ochaman?" degan
    // savolga vaqt sarflamasligi kerak
    expect(items.map((item) => item.kind)).toEqual(['driver', 'document', 'vehicle']);
  });

  it('★ KALIT TUR BILAN BIRGA — TOʻQNASHUV BOʻLMAYDI', () => {
    // Haydovchi elementining ID'si `userId`, hujjatniki hujjat ID'si.
    // Faqat ID bo'yicha tanlansa, bir xil qiymat ikki elementni
    // tanlangan ko'rsatishi mumkin
    const items = toQueue(
      response({
        documents: [
          {
            ...person,
            id: 'x-1',
            type: 'PASSPORT',
            ownerType: 'USER',
            ownerId: 'u-1',
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ],
        drivers: [
          {
            ...person,
            userId: 'x-1',
            licenseCategories: null,
            experienceYears: null,
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      }),
    );

    expect(new Set(items.map((item) => item.key)).size).toBe(2);
    expect(items.map((item) => item.key)).toContain('document:x-1');
    expect(items.map((item) => item.key)).toContain('driver:x-1');
  });

  it('bir xil vaqtdagi elementlar barqaror tartibda', () => {
    const build = () =>
      toQueue(
        response({
          vehicles: [
            {
              ...person,
              id: 'v-2',
              brand: 'Isuzu',
              model: null,
              plateNumber: '02B',
              capacityKg: null,
              createdAt: '2026-09-01T10:00:00.000Z',
            },
            {
              ...person,
              id: 'v-1',
              brand: 'MAN',
              model: null,
              plateNumber: '01A',
              capacityKg: null,
              createdAt: '2026-09-01T10:00:00.000Z',
            },
          ],
        }),
      );

    // Tartib har safar bir xil bo'lmasa, ro'yxat operator ko'z oldida
    // "sakraydi" va u tanlagan element o'rnini o'zgartiradi
    expect(build().map((item) => item.id)).toEqual(build().map((item) => item.id));
  });

  it('★ ISMSIZ FOYDALANUVCHI "HECH KIM" BOʻLIB QOLMAYDI', () => {
    const items = toQueue(
      response({
        documents: [
          {
            firstName: null,
            lastName: null,
            phone: null,
            id: 'd-1',
            type: 'PASSPORT',
            ownerType: 'USER',
            ownerId: 'u-1',
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      }),
    );

    expect(items[0]?.ownerName).toBe('Ism koʻrsatilmagan');
  });

  it('nomaʼlum hujjat turi kod bilan koʻrsatiladi', () => {
    const items = toQueue(
      response({
        documents: [
          {
            ...person,
            id: 'd-1',
            type: 'YANGI_TUR',
            ownerType: 'USER',
            ownerId: 'u-1',
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      }),
    );

    // Bo'sh sarlavha o'rniga kodning o'zi: operator kamida nima
    // ekanini serverdan so'rab bilishi mumkin
    expect(items[0]?.title).toBe('YANGI_TUR');
  });
});

describe('reviewPath', () => {
  it('★ HAR BIR TUR OʻZ ENDPOINTIGA KETADI', () => {
    const items = toQueue(
      response({
        documents: [
          {
            ...person,
            id: 'd-1',
            type: 'PASSPORT',
            ownerType: 'USER',
            ownerId: 'u-1',
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ],
        drivers: [
          {
            ...person,
            userId: 'u-2',
            licenseCategories: null,
            experienceYears: null,
            createdAt: '2026-09-01T10:00:01.000Z',
          },
        ],
        vehicles: [
          {
            ...person,
            id: 'v-1',
            brand: null,
            model: null,
            plateNumber: '01A',
            capacityKg: null,
            createdAt: '2026-09-01T10:00:02.000Z',
          },
        ],
      }),
    );

    // Noto'g'ri endpoint — noto'g'ri obyekt tasdiqlanadi va buni
    // orqaga qaytarib bo'lmaydi
    expect(reviewPath(items[0]!)).toBe('/admin/documents/d-1/review');
    expect(reviewPath(items[1]!)).toBe('/admin/drivers/u-2/review');
    expect(reviewPath(items[2]!)).toBe('/admin/vehicles/v-1/review');
  });
});

describe('nextAfterRemoval', () => {
  const items = toQueue(
    response({
      vehicles: [1, 2, 3].map((n) => ({
        ...person,
        id: `v-${n}`,
        brand: null,
        model: null,
        plateNumber: `0${n}A`,
        capacityKg: null,
        createdAt: `2026-09-01T10:0${n}:00.000Z`,
      })),
    }),
  );

  it('★ QARORDAN KEYIN KEYINGISI TANLANADI', () => {
    // 20 soniyalik maqsadning yuragi: operator sichqonchaga qaytmasligi
    // kerak
    expect(nextAfterRemoval(items, 'vehicle:v-1')?.id).toBe('v-2');
    expect(nextAfterRemoval(items, 'vehicle:v-2')?.id).toBe('v-3');
  });

  it('★ OXIRGISI HAL QILINSA — YANGI OXIRGISI', () => {
    // Ro'yxat tugagandek ko'rinib qolmasligi kerak
    expect(nextAfterRemoval(items, 'vehicle:v-3')?.id).toBe('v-2');
  });

  it('yagona element hal qilinsa — boʻsh', () => {
    expect(nextAfterRemoval([items[0]!], 'vehicle:v-1')).toBeNull();
  });

  it('notanish kalit — birinchisi', () => {
    expect(nextAfterRemoval(items, 'vehicle:yoq')?.id).toBe('v-1');
  });
});

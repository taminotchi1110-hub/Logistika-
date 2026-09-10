/**
 * Verifikatsiya navbati.
 *
 * SERVER UCH RO'YXAT QAYTARADI (hujjatlar, haydovchilar, transportlar),
 * PANEL ESA BITTA NAVBAT KO'RSATADI.
 *
 * Nega: operatorning vazifasi "navbatni bo'shatish", "qaysi turdagi
 * obyektni tekshiraman?" degan savol emas. Uch tab bo'lsa, u har safar
 * tanlashi kerak — va tanlash soniyalarni yeydi. Maqsad esa bitta
 * elementga ≤ 20 soniya (`docs/08-admin.md`).
 *
 * Tartib — FIFO, eng eskisi birinchi. Bu backend va'dasi va u adolatli:
 * kutayotgan haydovchi navbatda o'z o'rnini yo'qotmaydi.
 */

export type QueueKind = 'document' | 'driver' | 'vehicle';

/** Uch xil obyektning umumiy ko'rinishi. */
export interface QueueItem {
  kind: QueueKind;
  /**
   * Ro'yxatdagi yagona kalit — `"<tur>:<id>"`.
   *
   * Faqat `id` yetarli emas: haydovchi elementining ID'si `userId`, va
   * o'sha foydalanuvchining hujjati bilan bir xil bo'lib qolishi
   * nazariy jihatdan mumkin. Ikkita element bir xil kalitga ega bo'lsa,
   * biri tanlanganda ikkinchisi ham tanlangan ko'rinadi va qaror
   * noto'g'ri obyektga ketishi mumkin.
   */
  key: string;
  /** Tekshirish endpointiga yuboriladigan ID. */
  id: string;
  /** Ro'yxatdagi asosiy sarlavha. */
  title: string;
  /** Sarlavha ostidagi tafsilot. */
  subtitle: string;
  /** Kimning obyekti — ism va telefon. */
  ownerName: string;
  ownerPhone: string;
  createdAt: string;
}

export interface QueueResponse {
  documents: RawDocument[];
  drivers: RawDriver[];
  vehicles: RawVehicle[];
  total: number;
}

interface Person {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

interface RawDocument extends Person {
  id: string;
  type: string;
  ownerType: string;
  ownerId: string;
  createdAt: string;
}

interface RawDriver extends Person {
  userId: string;
  licenseCategories: string[] | null;
  experienceYears: number | null;
  createdAt: string;
}

interface RawVehicle extends Person {
  id: string;
  brand: string | null;
  model: string | null;
  plateNumber: string;
  capacityKg: number | null;
  createdAt: string;
}

/** Hujjat turlari — backend `DocumentType` bilan bir xil. */
export const DOCUMENT_LABELS: Record<string, string> = {
  PASSPORT: 'Pasport',
  ID_CARD: 'ID karta',
  DRIVER_LICENSE: 'Haydovchilik guvohnomasi',
  VEHICLE_REG: 'Texnik pasport',
  INSURANCE: 'Sugʻurta',
  CARGO_DOC: 'Yuk hujjati',
  WAYBILL: 'Yuk xati',
  CONTRACT: 'Shartnoma',
  POD: 'Yetkazish tasdigʻi',
  POP: 'Toʻlov tasdigʻi',
  SIGNATURE: 'Imzo',
  OTHER: 'Boshqa',
};

export const KIND_LABELS: Record<QueueKind, string> = {
  document: 'Hujjat',
  driver: 'Haydovchi',
  vehicle: 'Transport',
};

function personName(person: Person): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  // Ism bo'lmasligi mumkin: profil to'ldirilmagan holatda. Bo'sh satr
  // ro'yxatda "hech kim" bo'lib ko'rinadi va operator kimni tekshirayotganini
  // bilmaydi
  return name || 'Ism koʻrsatilmagan';
}

/**
 * Uch ro'yxatni bitta navbatga qo'shadi va vaqt bo'yicha tartiblaydi.
 *
 * `sort` BARQAROR bo'lishi shart: bir xil `createdAt` li ikki element
 * har safar boshqacha tartibda chiqsa, ro'yxat operator ko'z oldida
 * "sakraydi" va u tanlagan element o'rnini o'zgartiradi. Shuning uchun
 * teng vaqtlarda ID bo'yicha qo'shimcha tartib.
 */
export function toQueue(response: QueueResponse): QueueItem[] {
  const items: QueueItem[] = [
    ...response.documents.map(
      (document): QueueItem => ({
        kind: 'document',
        key: `document:${document.id}`,
        id: document.id,
        title: DOCUMENT_LABELS[document.type] ?? document.type,
        subtitle: personName(document),
        ownerName: personName(document),
        ownerPhone: document.phone ?? '',
        createdAt: document.createdAt,
      }),
    ),

    ...response.drivers.map((driver): QueueItem => {
      const categories = driver.licenseCategories?.join(', ') ?? '';
      const years = driver.experienceYears;
      return {
        kind: 'driver',
        key: `driver:${driver.userId}`,
        // Haydovchi uchun ID — `userId`: tekshirish endpointi
        // `POST /admin/drivers/:id/review` aynan shuni kutadi
        id: driver.userId,
        title: personName(driver),
        subtitle: [
          categories ? `Toifa: ${categories}` : null,
          years !== null && years !== undefined ? `${years} yil tajriba` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        ownerName: personName(driver),
        ownerPhone: driver.phone ?? '',
        createdAt: driver.createdAt,
      };
    }),

    ...response.vehicles.map((vehicle): QueueItem => {
      const model = [vehicle.brand, vehicle.model].filter(Boolean).join(' ').trim();
      return {
        kind: 'vehicle',
        key: `vehicle:${vehicle.id}`,
        id: vehicle.id,
        title: vehicle.plateNumber,
        subtitle: [
          model || null,
          vehicle.capacityKg ? `${(vehicle.capacityKg / 1000).toFixed(1)} t` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        ownerName: personName(vehicle),
        ownerPhone: vehicle.phone ?? '',
        createdAt: vehicle.createdAt,
      };
    }),
  ];

  return items.sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    return byTime !== 0 ? byTime : a.key.localeCompare(b.key);
  });
}

/** Tekshirish endpointi — tur bo'yicha. */
export function reviewPath(item: QueueItem): string {
  return {
    document: `/admin/documents/${item.id}/review`,
    driver: `/admin/drivers/${item.id}/review`,
    vehicle: `/admin/vehicles/${item.id}/review`,
  }[item.kind];
}

/**
 * Qaror qabul qilingandan keyin qaysi element tanlanadi.
 *
 * KEYINGISI, oldingisi emas: navbat FIFO va operator pastga qarab
 * harakatlanadi. Oxirgi element hal qilinsa — endi oxirgi bo'lib
 * qolgan element (ya'ni yangi ro'yxatning oxiri).
 *
 * Bu funksiya alohida chiqarilgan, chunki "qaror → keyingisi" — 20
 * soniyalik maqsadning yuragi: operator qo'l bilan tanlashi kerak
 * bo'lsa, har bir element bir necha soniya qimmatlashadi.
 */
export function nextAfterRemoval(items: QueueItem[], removedKey: string): QueueItem | null {
  const index = items.findIndex((item) => item.key === removedKey);
  if (index === -1) return items[0] ?? null;

  const remaining = items.filter((item) => item.key !== removedKey);
  if (remaining.length === 0) return null;

  // O'chirilgan element o'rnida turgan element — ya'ni "keyingisi".
  // Oxirgisi o'chirilgan bo'lsa, yangi oxirgisi
  return remaining[index] ?? remaining[remaining.length - 1] ?? null;
}

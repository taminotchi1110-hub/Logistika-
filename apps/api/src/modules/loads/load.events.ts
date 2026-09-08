/**
 * Yuk hodisalari.
 *
 * NEGA HODISA, TO'G'RIDAN-TO'G'RI CHAQIRUV EMAS:
 *   1. `LoadsService` matchingdan xabardor bo'lmasligi kerak — aks holda
 *      ikki modul bir-biriga tsiklik bog'lanadi (matching narx uchun
 *      `PricingService` ni oladi, u esa `LoadsModule` da).
 *   2. Matching sekin (SQL + hisob + push). E'lon qilish javobi uni
 *      kutib turmasligi kerak.
 *   3. Kelajakda matching alohida worker jarayoniga ko'chiriladi —
 *      o'shanda faqat shu tinglovchi Redis navbatiga almashadi, e'lon
 *      qilish kodi umuman o'zgarmaydi.
 */
export const LOAD_PUBLISHED = 'load.published';

export class LoadPublishedEvent {
  constructor(
    readonly loadId: string,
    readonly shipperId: string,
  ) {}
}

/** Haydovchi yuk kartasini ochdi — ML uchun "ko'rdi" belgisi. */
export const LOAD_VIEWED = 'load.viewed';

export class LoadViewedEvent {
  constructor(
    readonly loadId: string,
    readonly driverId: string,
  ) {}
}

/** Haydovchi taklif yubordi — ML uchun eng qimmatli belgi. */
export const OFFER_CREATED = 'offer.created';

export class OfferCreatedEvent {
  constructor(
    readonly loadId: string,
    readonly driverId: string,
  ) {}
}

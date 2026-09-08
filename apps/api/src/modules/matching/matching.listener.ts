import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  LOAD_PUBLISHED,
  LOAD_VIEWED,
  LoadPublishedEvent,
  LoadViewedEvent,
  OFFER_CREATED,
  OfferCreatedEvent,
} from '@/modules/loads/load.events';

import { MatchingService } from './matching.service';

/**
 * Yuk e'lon qilinganda matchingni ishga tushiradi.
 *
 * `async: true` — tinglovchi asosiy so'rovni bloklamaydi. Yuk beruvchi
 * "E'lon qilindi" javobini darhol oladi, matching esa fonda ishlaydi.
 *
 * XATO YUTILADI: matching yiqilsa ham yuk lentada ko'rinaveradi va
 * haydovchi uni o'zi topadi. Matching — qulaylik, majburiy bosqich emas.
 * Shuning uchun bu yerdagi xato e'lon qilishni buzmaydi, lekin ERROR
 * darajasida logga tushadi (jimgina yo'qolmaydi).
 */
@Injectable()
export class MatchingListener {
  private readonly logger = new Logger(MatchingListener.name);

  constructor(private readonly matching: MatchingService) {}

  @OnEvent(LOAD_PUBLISHED, { async: true })
  async onLoadPublished(event: LoadPublishedEvent): Promise<void> {
    const startedAt = Date.now();

    try {
      const ranked = await this.matching.runForLoad(event.loadId);
      this.logger.log(
        { loadId: event.loadId, found: ranked.length, ms: Date.now() - startedAt },
        'Eʼlon boʻyicha matching bajarildi',
      );
    } catch (error) {
      this.logger.error(
        { err: error, loadId: event.loadId },
        'Matching bajarilmadi — yuk baribir lentada koʻrinadi',
      );
    }
  }

  /**
   * ML uchun belgilar (label).
   *
   * "Koʻrdi, lekin taklif yubormadi" — ball juda yuqori berilganini
   * bildiradi. "Koʻrdi va taklif yubordi" — ball toʻgʻri edi. Bu ikki
   * belgi kelajakdagi modelning asosiy oʻquv materiali.
   */
  @OnEvent(LOAD_VIEWED, { async: true })
  async onLoadViewed(event: LoadViewedEvent): Promise<void> {
    try {
      await this.matching.markViewed(event.loadId, event.driverId);
    } catch (error) {
      this.logger.warn({ err: error, loadId: event.loadId }, 'viewed_at yozilmadi');
    }
  }

  @OnEvent(OFFER_CREATED, { async: true })
  async onOfferCreated(event: OfferCreatedEvent): Promise<void> {
    try {
      await this.matching.markOffered(event.loadId, event.driverId);
    } catch (error) {
      this.logger.warn({ err: error, loadId: event.loadId }, 'offered_at yozilmadi');
    }
  }
}

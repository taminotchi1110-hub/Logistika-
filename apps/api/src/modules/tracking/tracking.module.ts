import { Module } from '@nestjs/common';

import { TrackingController } from './tracking.controller';
import { TrackingListener } from './tracking.listener';
import { TrackingService } from './tracking.service';

/**
 * Kuzatuv moduli.
 *
 * Hech qanday boshqa modulga bogʻlanmaydi: buyurtma yakunlanganda
 * marshrutni arxivlash hodisa orqali ishga tushadi. Shu sababli kuzatuvni
 * keyinchalik alohida servisga ajratish oson boʻladi — u eng koʻp yozuv
 * qiladigan qism (har 10 soniyada har bir faol haydovchidan nuqta).
 */
@Module({
  controllers: [TrackingController],
  providers: [TrackingService, TrackingListener],
  exports: [TrackingService],
})
export class TrackingModule {}

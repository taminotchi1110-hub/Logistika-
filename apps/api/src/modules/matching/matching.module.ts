import { Module } from '@nestjs/common';

import { LoadsModule } from '@/modules/loads/loads.module';

import { MatchingController } from './matching.controller';
import { MatchingListener } from './matching.listener';
import { MatchingService } from './matching.service';

/**
 * Matching moduli.
 *
 * `LoadsModule` dan faqat `PricingService` kerak (narx jozibadorligini
 * baholash uchun). Teskari bog'lanish yo'q: `LoadsService` matchingni
 * to'g'ridan-to'g'ri chaqirmaydi — hodisa orqali ishga tushadi, aks holda
 * ikki modul bir-biriga tsiklik bog'lanib qolardi.
 */
@Module({
  imports: [LoadsModule],
  controllers: [MatchingController],
  providers: [MatchingService, MatchingListener],
  exports: [MatchingService],
})
export class MatchingModule {}

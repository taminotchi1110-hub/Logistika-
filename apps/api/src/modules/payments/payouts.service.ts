import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { formatSoum, toTiyin } from '@/common/utils/money.util';
import { DatabaseService } from '@/infra/database/database.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { tpl } from '@/modules/notifications/notification-templates';

import { LedgerService } from './ledger.service';

/** Eng kam yechish summasi — bank komissiyasi buni oqlashi kerak. */
const MIN_PAYOUT_TIYIN = 1_000_000n; // 10 000 so'm

/**
 * Haydovchiga pul yechish.
 *
 * OQIM: haydovchi so'rov beradi → pul hamyondan darhol yechiladi va
 * `PAYOUT_PAYABLE` hisobiga o'tadi → admin/PSP kartaga o'tkazadi →
 * `PAYOUT_PAYABLE` nolga qaytadi.
 *
 * NEGA PUL DARHOL YECHILADI: aks holda haydovchi bir summani ikki marta
 * yechish so'rovi bera olardi. `PAYOUT_PAYABLE` — "platforma haydovchiga
 * qarzdor" degan ma'noni bildiruvchi oraliq hisob.
 *
 * KARTA MA'LUMOTI: PAN (16 xonali raqam) HECH QACHON SAQLANMAYDI.
 * Bazada faqat maskalangan ko'rinish (`8600 **** **** 1234`) va PSP
 * bergan token turadi. Bu PCI DSS talabi va shaxsiy ma'lumot qonuni
 * bo'yicha ham majburiy.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async request(
    driverId: string,
    input: { amountTiyin: bigint; cardNumber: string },
  ): Promise<{ id: string; amountTiyin: string; cardMask: string; status: string }> {
    if (input.amountTiyin < MIN_PAYOUT_TIYIN) {
      throw AppError.badRequest(
        ErrorCode.PAYOUT_TOO_SMALL,
        `Eng kam summa ${formatSoum(MIN_PAYOUT_TIYIN)}`,
      );
    }

    const digits = input.cardNumber.replace(/\D/g, '');
    if (digits.length < 16 || digits.length > 19) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Karta raqami notoʻgʻri');
    }

    // Kutilayotgan so'rov bo'lsa yangisiga ruxsat bermaymiz — aks holda
    // balansni bir necha marta "band qilib" qo'yish mumkin
    const pending = await this.database.db
      .selectFrom('payouts')
      .select('id')
      .where('driverId', '=', driverId)
      .where('status', 'in', ['CREATED', 'PENDING'])
      .executeTakeFirst();

    if (pending) {
      throw AppError.conflict(
        ErrorCode.PAYOUT_ALREADY_PENDING,
        'Sizda hali koʻrib chiqilmagan soʻrov bor',
      );
    }

    const wallet = await this.ledger.ensureWallet(driverId);
    if (toTiyin(wallet.balanceTiyin) < input.amountTiyin) {
      throw AppError.conflict(ErrorCode.WALLET_INSUFFICIENT_FUNDS, 'Mablagʻ yetarli emas', {
        balanceTiyin: wallet.balanceTiyin,
        requestedTiyin: input.amountTiyin.toString(),
      });
    }

    const payout = await this.database.db
      .insertInto('payouts')
      .values({
        driverId,
        amountTiyin: input.amountTiyin.toString(),
        method: 'CARD',
        cardMask: maskCard(digits),
        status: 'CREATED',
      })
      .returning(['id', 'amountTiyin', 'cardMask', 'status'])
      .executeTakeFirstOrThrow();

    const payable = await this.ledger.systemAccount('PAYOUT_PAYABLE');

    await this.ledger.transfer({
      legs: [
        { accountId: wallet.id, amountTiyin: -input.amountTiyin },
        { accountId: payable.id, amountTiyin: input.amountTiyin },
      ],
      entryType: 'PAYOUT',
      description: `Pul yechish soʻrovi (${payout.cardMask})`,
      idempotencyKey: `payout:${payout.id}`,
      meta: { payoutId: payout.id },
    });

    this.logger.log(
      { payoutId: payout.id, driverId, amountTiyin: input.amountTiyin.toString() },
      'Pul yechish soʻrovi yaratildi',
    );

    return { ...payout, cardMask: payout.cardMask ?? '' };
  }

  async listMine(driverId: string, limit = 30) {
    return this.database.db
      .selectFrom('payouts')
      .select([
        'id',
        'amountTiyin',
        'cardMask',
        'status',
        'requestedAt',
        'processedAt',
        'failureReason',
      ])
      .where('driverId', '=', driverId)
      .orderBy('requestedAt', 'desc')
      .limit(limit)
      .execute();
  }

  /**
   * Admin so'rovni bajardi (pul kartaga o'tkazildi).
   *
   * `PAYOUT_PAYABLE` dan chiqadi va `PSP_CLEARING` ga o'tadi — bank
   * tomonidan hisobdan yechilganini bildiradi.
   */
  async complete(payoutId: string, providerTxnId: string): Promise<void> {
    const payout = await this.database.db
      .selectFrom('payouts')
      .selectAll()
      .where('id', '=', payoutId)
      .executeTakeFirst();

    if (!payout) throw AppError.notFound('Soʻrov topilmadi');
    if (payout.status === 'PAID') return;

    const payable = await this.ledger.systemAccount('PAYOUT_PAYABLE');
    const clearing = await this.ledger.systemAccount('PSP_CLEARING');
    const amount = toTiyin(payout.amountTiyin);

    await this.ledger.transfer({
      legs: [
        { accountId: payable.id, amountTiyin: -amount },
        { accountId: clearing.id, amountTiyin: amount },
      ],
      entryType: 'PAYOUT',
      description: `Kartaga oʻtkazildi (${payout.cardMask})`,
      idempotencyKey: `payout-complete:${payoutId}`,
    });

    await this.database.db
      .updateTable('payouts')
      .set({ status: 'PAID', processedAt: new Date(), providerTxnId })
      .where('id', '=', payoutId)
      .execute();

    await this.notifications.notify({
      userId: payout.driverId,
      type: 'payout.processed',
      template: tpl('payout.completed', { amountTiyin: amount, cardMask: payout.cardMask }),
      entityType: 'PAYMENT',
      entityId: payoutId,
      deepLink: 'karvon://wallet',
      dedupeKey: `payout-done:${payoutId}`,
    });
  }

  /** So'rov rad etildi — pul hamyonga qaytadi. */
  async reject(payoutId: string, reason: string): Promise<void> {
    const payout = await this.database.db
      .selectFrom('payouts')
      .selectAll()
      .where('id', '=', payoutId)
      .executeTakeFirst();

    if (!payout) throw AppError.notFound('Soʻrov topilmadi');
    if (payout.status === 'FAILED' || payout.status === 'CANCELLED') return;

    const payable = await this.ledger.systemAccount('PAYOUT_PAYABLE');
    const wallet = await this.ledger.ensureWallet(payout.driverId);
    const amount = toTiyin(payout.amountTiyin);

    await this.ledger.transfer({
      legs: [
        { accountId: payable.id, amountTiyin: -amount },
        { accountId: wallet.id, amountTiyin: amount },
      ],
      entryType: 'PAYOUT_REVERSAL',
      description: `Yechish rad etildi: ${reason}`,
      idempotencyKey: `payout-reject:${payoutId}`,
    });

    await this.database.db
      .updateTable('payouts')
      .set({ status: 'FAILED', processedAt: new Date(), failureReason: reason })
      .where('id', '=', payoutId)
      .execute();

    await this.notifications.notify({
      userId: payout.driverId,
      type: 'payout.processed',
      template: tpl('payout.rejected', { amountTiyin: amount, reason }),
      entityType: 'PAYMENT',
      entityId: payoutId,
      deepLink: 'karvon://wallet',
      dedupeKey: `payout-rejected:${payoutId}`,
    });
  }

  /** Buyurtma to'lovi ko'rinishi — ikkala tomon uchun. */
  async orderPaymentView(orderId: string, viewerId: string) {
    const order = await this.database.db
      .selectFrom('orders')
      .select([
        'id',
        'shipperId',
        'driverId',
        'priceTiyin',
        'commissionTiyin',
        'driverPayoutTiyin',
        'commissionRate',
        'paymentMethod',
        'paymentStatus',
      ])
      .where('id', '=', orderId)
      .executeTakeFirst();

    if (!order || (order.shipperId !== viewerId && order.driverId !== viewerId)) {
      throw AppError.notFound('Buyurtma topilmadi');
    }

    return order;
  }
}

/**
 * Karta raqamini maskalaydi: `8600123456781234` → `8600 **** **** 1234`.
 *
 * Birinchi 4 raqam — bank identifikatori (8600 = Uzcard, 9860 = Humo),
 * mijoz qaysi kartani tanlaganini shundan biladi. Oxirgi 4 — tekshirish
 * uchun. O'rtasi hech qachon saqlanmaydi.
 */
export function maskCard(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean.length < 8) return '****';

  return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`;
}

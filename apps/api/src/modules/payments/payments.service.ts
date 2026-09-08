import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { toTiyin } from '@/common/utils/money.util';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';
import type { PaymentStatus, PspProvider } from '@/infra/database/database.types';
import { NotificationsService } from '@/modules/notifications/notifications.service';

import { LedgerService } from './ledger.service';

/** To'lovning maqsadi — hisobotlar va callback mantiqi shunga bog'liq. */
export type PaymentPurpose = 'WALLET_TOPUP' | 'ORDER_ESCROW' | 'SUBSCRIPTION';

/** Eng kichik to'ldirish summasi — PSP komissiyasi buni oqlashi kerak. */
const MIN_TOPUP_TIYIN = 500_000n; // 5 000 so'm

/** Eng katta bir martalik to'ldirish — firibgarlikni cheklash. */
const MAX_TOPUP_TIYIN = 5_000_000_000n; // 50 mln so'm

export interface PaymentView {
  id: string;
  provider: PspProvider;
  purpose: string;
  amountTiyin: string;
  status: PaymentStatus;
  /** Foydalanuvchini yoʻnaltirish uchun havola. */
  checkoutUrl: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

/**
 * To'lovlar.
 *
 * OQIM: mijoz to'lov yaratadi → PSP sahifasiga o'tadi → PSP bizning
 * webhook'imizga so'rov yuboradi → biz hamyonni to'ldiramiz.
 *
 * IDEMPOTENTLIK — asosiy talab. PSP bir xil callback'ni bir necha marta
 * yuborishi mumkin (tarmoq uzilishi, qayta urinish). Ikki joyda himoya:
 *   1. `payments.idempotency_key` — UNIQUE indeks
 *   2. `LedgerService.transfer({ idempotencyKey })` — ikkinchi marta
 *      pul qo'shilmaydi
 *
 * Bu ikkilanish ataylab: birinchisi to'lov yozuvini, ikkinchisi PULNI
 * himoya qiladi. Pul muhimroq.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly clickServiceId: string;
  private readonly clickMerchantId: string;
  private readonly paymeMerchantId: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {
    this.clickServiceId = this.config.get('CLICK_SERVICE_ID', { infer: true }) ?? '';
    this.clickMerchantId = this.config.get('CLICK_MERCHANT_ID', { infer: true }) ?? '';
    this.paymeMerchantId = this.config.get('PAYME_MERCHANT_ID', { infer: true }) ?? '';
  }

  // =================================================================
  //  Mijoz tomoni
  // =================================================================

  /**
   * Hamyonni to'ldirish uchun to'lov yaratadi.
   *
   * Pul BU YERDA qo'shilmaydi — faqat PSP tasdiqlagandan keyin
   * (`markPaid`). Aks holda to'lamasdan balans oshirish mumkin bo'lardi.
   */
  async createTopup(
    userId: string,
    input: { amountTiyin: bigint; provider: PspProvider },
  ): Promise<PaymentView> {
    if (input.amountTiyin < MIN_TOPUP_TIYIN) {
      throw AppError.badRequest(
        ErrorCode.PAYMENT_AMOUNT_INVALID,
        `Eng kam summa ${MIN_TOPUP_TIYIN / 100n} soʻm`,
      );
    }
    if (input.amountTiyin > MAX_TOPUP_TIYIN) {
      throw AppError.badRequest(
        ErrorCode.PAYMENT_AMOUNT_INVALID,
        `Eng koʻp summa ${MAX_TOPUP_TIYIN / 100n} soʻm`,
      );
    }

    // Hamyon oldindan yaratiladi: callback kelganda uni yaratish bilan
    // ovora bo'lmaymiz (o'sha payt tranzaksiya ichida bo'lamiz)
    await this.ledger.ensureWallet(userId);

    const payment = await this.database.db
      .insertInto('payments')
      .values({
        userId,
        provider: input.provider,
        idempotencyKey: `topup:${randomUUID()}`,
        purpose: 'WALLET_TOPUP',
        amountTiyin: input.amountTiyin.toString(),
        status: 'CREATED',
      })
      .returning(['id', 'provider', 'purpose', 'amountTiyin', 'status', 'createdAt', 'paidAt'])
      .executeTakeFirstOrThrow();

    this.logger.log(
      { paymentId: payment.id, userId, provider: input.provider },
      'Toʻlov yaratildi',
    );

    return { ...payment, checkoutUrl: this.checkoutUrl(payment.id, input) };
  }

  /**
   * PSP sahifasiga havola.
   *
   * Click: GET parametrlari bilan; Payme: base64 kodlangan parametrlar.
   * Kalitlar sozlanmagan bo'lsa `null` — dev muhitida to'lov
   * `markPaid()` bilan qo'lda tasdiqlanadi.
   */
  private checkoutUrl(
    paymentId: string,
    input: { amountTiyin: bigint; provider: PspProvider },
  ): string | null {
    if (input.provider === 'CLICK') {
      if (!this.clickServiceId || !this.clickMerchantId) return null;

      const amount = Number(input.amountTiyin) / 100;
      return (
        `https://my.click.uz/services/pay?service_id=${this.clickServiceId}` +
        `&merchant_id=${this.clickMerchantId}` +
        `&amount=${amount}` +
        `&transaction_param=${paymentId}`
      );
    }

    if (input.provider === 'PAYME') {
      if (!this.paymeMerchantId) return null;

      // Payme parametrlarni `;` bilan ajratib, base64 da kutadi
      const params = [
        `m=${this.paymeMerchantId}`,
        `ac.payment_id=${paymentId}`,
        `a=${input.amountTiyin}`,
      ].join(';');

      return `https://checkout.paycom.uz/${Buffer.from(params).toString('base64')}`;
    }

    return null;
  }

  async listMine(userId: string, limit = 30): Promise<PaymentView[]> {
    const rows = await this.database.db
      .selectFrom('payments')
      .select(['id', 'provider', 'purpose', 'amountTiyin', 'status', 'createdAt', 'paidAt'])
      .where('userId', '=', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({ ...row, checkoutUrl: null }));
  }

  async getById(paymentId: string) {
    return this.database.db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', paymentId)
      .executeTakeFirst();
  }

  // =================================================================
  //  PSP tomoni (webhook)
  // =================================================================

  /**
   * To'lovni tasdiqlaydi va hamyonni to'ldiradi.
   *
   * Idempotent: ikkinchi marta chaqirilsa `alreadyPaid: true` qaytadi
   * va pul QAYTA qo'shilmaydi.
   */
  async markPaid(
    paymentId: string,
    input: { providerTxnId?: string; rawCallback?: unknown } = {},
  ): Promise<{ alreadyPaid: boolean }> {
    const payment = await this.getById(paymentId);
    if (!payment) {
      throw AppError.notFound('Toʻlov topilmadi');
    }
    if (payment.status === 'PAID') {
      return { alreadyPaid: true };
    }
    if (payment.status === 'CANCELLED' || payment.status === 'REFUNDED') {
      throw AppError.conflict(
        ErrorCode.PAYMENT_PROVIDER_ERROR,
        'Bekor qilingan toʻlovni tasdiqlab boʻlmaydi',
      );
    }

    const amount = toTiyin(payment.amountTiyin);
    const wallet = await this.ledger.ensureWallet(payment.userId);
    const clearing = await this.ledger.systemAccount('PSP_CLEARING');

    // Pul PSP'dan foydalanuvchi hamyoniga o'tadi.
    // PSP_CLEARING manfiyga tushadi — bu normal: u "PSP bizga qarzdor"
    // degan ma'noni bildiradi va PSP pul o'tkazganda nolga qaytadi.
    await this.ledger.transfer({
      legs: [
        { accountId: clearing.id, amountTiyin: -amount },
        { accountId: wallet.id, amountTiyin: amount },
      ],
      entryType: 'TOPUP',
      paymentId: payment.id,
      description: `Hamyon toʻldirildi (${payment.provider})`,
      idempotencyKey: `payment:${payment.id}`,
      meta: { provider: payment.provider, providerTxnId: input.providerTxnId },
    });

    await this.database.db
      .updateTable('payments')
      .set({
        status: 'PAID',
        paidAt: new Date(),
        providerTxnId: input.providerTxnId ?? null,
        rawCallback: input.rawCallback === undefined ? null : JSON.stringify(input.rawCallback),
        updatedAt: new Date(),
      })
      .where('id', '=', paymentId)
      .where('status', '!=', 'PAID')
      .execute();

    this.logger.log(
      { paymentId, userId: payment.userId, amountTiyin: payment.amountTiyin },
      'Toʻlov tasdiqlandi',
    );

    await this.notifications.notify({
      userId: payment.userId,
      type: 'payment.received',
      title: 'Hamyon toʻldirildi',
      body: `${(amount / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} soʻm hisobingizga tushdi`,
      entityType: 'PAYMENT',
      entityId: payment.id,
      deepLink: 'karvon://wallet',
      dedupeKey: `payment:${payment.id}`,
    });

    return { alreadyPaid: false };
  }

  /** To'lovni bekor qiladi (PSP bekor qilgan yoki muddati o'tgan). */
  async markCancelled(paymentId: string, reason: string, rawCallback?: unknown): Promise<void> {
    const payment = await this.getById(paymentId);
    if (!payment) throw AppError.notFound('Toʻlov topilmadi');

    // Allaqachon to'langan bo'lsa — pulni qaytaramiz
    if (payment.status === 'PAID') {
      const amount = toTiyin(payment.amountTiyin);
      const wallet = await this.ledger.ensureWallet(payment.userId);
      const clearing = await this.ledger.systemAccount('PSP_CLEARING');

      await this.ledger.transfer({
        legs: [
          { accountId: wallet.id, amountTiyin: -amount },
          { accountId: clearing.id, amountTiyin: amount },
        ],
        entryType: 'ADJUSTMENT',
        paymentId: payment.id,
        description: `Toʻlov qaytarildi: ${reason}`,
        idempotencyKey: `refund:${payment.id}`,
      });
    }

    await this.database.db
      .updateTable('payments')
      .set({
        status: payment.status === 'PAID' ? 'REFUNDED' : 'CANCELLED',
        errorMessage: reason,
        rawCallback: rawCallback === undefined ? null : JSON.stringify(rawCallback),
        updatedAt: new Date(),
      })
      .where('id', '=', paymentId)
      .execute();

    this.logger.log({ paymentId, reason }, 'Toʻlov bekor qilindi');
  }

  /** Holatni yangilaydi (PSP oraliq holatlari uchun). */
  async setStatus(paymentId: string, status: PaymentStatus): Promise<void> {
    await this.database.db
      .updateTable('payments')
      .set({ status, updatedAt: new Date() })
      .where('id', '=', paymentId)
      .execute();
  }
}

import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public, RawResponse } from '@/common/decorators';
import { toTiyin } from '@/common/utils/money.util';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/infra/database/database.service';

import { PaymentsService } from './payments.service';
import {
  CLICK_ACTION,
  CLICK_ERROR,
  clickAmountToTiyin,
  clickError,
  verifyClickSignature,
  type ClickRequest,
  type ClickResponse,
} from './providers/click.protocol';
import {
  PAYME_ERROR,
  PAYME_STATE,
  extractPaymentId,
  isPaymeTimedOut,
  paymeFailure,
  paymeSuccess,
  paymeTime,
  verifyPaymeAuth,
  type PaymeRpcRequest,
} from './providers/payme.protocol';

/**
 * PSP webhook'lari.
 *
 * BU ENDPOINTLAR OCHIQ (`@Public`) — ularga Click va Payme serverlari
 * murojaat qiladi, foydalanuvchi emas. Himoya boshqa usulda:
 *   Click — MD5 imzo (`sign_string`)
 *   Payme — HTTP Basic (`Paycom:MERCHANT_KEY`)
 *
 * Swagger'dan yashirilgan: bu ichki protokol, mobil ilova uchun emas.
 *
 * MUHIM: ikkala provayder ham HTTP 200 kutadi. Xato JAVOB ICHIDA
 * qaytariladi. 500 qaytarsak, ular buni "aloqa uzildi" deb hisoblab
 * so'rovni qayta-qayta yuboraveradi va navbat to'lib ketadi.
 */
@ApiExcludeController()
@RawResponse()
@Controller('payments/webhook')
export class PaymentWebhooksController {
  private readonly logger = new Logger(PaymentWebhooksController.name);
  private readonly clickSecret: string;
  private readonly paymeKey: string;

  constructor(
    private readonly payments: PaymentsService,
    private readonly database: DatabaseService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.clickSecret = config.get('CLICK_SECRET_KEY', { infer: true }) ?? '';
    this.paymeKey = config.get('PAYME_MERCHANT_KEY', { infer: true }) ?? '';
  }

  // =================================================================
  //  Click
  // =================================================================

  @Public()
  @Post('click/prepare')
  @HttpCode(HttpStatus.OK)
  async clickPrepare(@Body() body: ClickRequest): Promise<ClickResponse> {
    return this.handleClick(body, CLICK_ACTION.PREPARE);
  }

  @Public()
  @Post('click/complete')
  @HttpCode(HttpStatus.OK)
  async clickComplete(@Body() body: ClickRequest): Promise<ClickResponse> {
    return this.handleClick(body, CLICK_ACTION.COMPLETE);
  }

  private async handleClick(body: ClickRequest, expectedAction: number): Promise<ClickResponse> {
    const clickTransId = Number(body?.click_trans_id ?? 0);
    const merchantTransId = String(body?.merchant_trans_id ?? '');

    if (!this.clickSecret) {
      this.logger.error('Click kaliti sozlanmagan — webhook rad etildi');
      return clickError(CLICK_ERROR.ERROR_IN_REQUEST, merchantTransId, clickTransId);
    }

    if (Number(body?.action) !== expectedAction) {
      return clickError(CLICK_ERROR.ACTION_NOT_FOUND, merchantTransId, clickTransId);
    }

    if (!verifyClickSignature(body, this.clickSecret)) {
      this.logger.warn({ merchantTransId, clickTransId }, 'Click imzosi notoʻgʻri');
      return clickError(CLICK_ERROR.SIGN_CHECK_FAILED, merchantTransId, clickTransId);
    }

    // Click foydalanuvchi bekor qilganini `error` maydonida bildiradi
    if (body.error && Number(body.error) < 0) {
      await this.payments
        .markCancelled(merchantTransId, `Click: ${body.error_note ?? body.error}`, body)
        .catch(() => undefined);
      return clickError(CLICK_ERROR.TRANSACTION_CANCELLED, merchantTransId, clickTransId);
    }

    const payment = await this.payments.getById(merchantTransId).catch(() => undefined);
    if (!payment) {
      return clickError(CLICK_ERROR.TRANSACTION_NOT_FOUND, merchantTransId, clickTransId);
    }

    const amount = clickAmountToTiyin(body.amount);
    if (amount === null || amount !== toTiyin(payment.amountTiyin)) {
      this.logger.warn(
        { merchantTransId, expected: payment.amountTiyin, received: body.amount },
        'Click summasi mos kelmadi',
      );
      return clickError(CLICK_ERROR.INCORRECT_AMOUNT, merchantTransId, clickTransId);
    }

    if (payment.status === 'CANCELLED' || payment.status === 'REFUNDED') {
      return clickError(CLICK_ERROR.TRANSACTION_CANCELLED, merchantTransId, clickTransId);
    }

    if (expectedAction === CLICK_ACTION.PREPARE) {
      if (payment.status === 'PAID') {
        return clickError(CLICK_ERROR.ALREADY_PAID, merchantTransId, clickTransId);
      }

      await this.payments.setStatus(payment.id, 'PENDING');

      return {
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        // `merchant_prepare_id` — bizning ichki ID'imiz. Click uni
        // Complete bosqichida qaytaradi va imzoga qo'shadi.
        merchant_prepare_id: clickTransId,
        error: CLICK_ERROR.SUCCESS,
        error_note: 'Success',
      };
    }

    // Complete
    const result = await this.payments.markPaid(payment.id, {
      providerTxnId: String(clickTransId),
      rawCallback: body,
    });

    return {
      click_trans_id: clickTransId,
      merchant_trans_id: merchantTransId,
      merchant_confirm_id: clickTransId,
      error: result.alreadyPaid ? CLICK_ERROR.ALREADY_PAID : CLICK_ERROR.SUCCESS,
      error_note: result.alreadyPaid ? 'Already paid' : 'Success',
    };
  }

  // =================================================================
  //  Payme (JSON-RPC 2.0)
  // =================================================================

  @Public()
  @Post('payme')
  @HttpCode(HttpStatus.OK)
  async payme(
    @Body() body: PaymeRpcRequest,
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    if (!this.paymeKey || !verifyPaymeAuth(authorization, this.paymeKey)) {
      return paymeFailure(body?.id, PAYME_ERROR.INSUFFICIENT_PRIVILEGE);
    }

    try {
      switch (body?.method) {
        case 'CheckPerformTransaction':
          return await this.paymeCheckPerform(body);
        case 'CreateTransaction':
          return await this.paymeCreate(body);
        case 'PerformTransaction':
          return await this.paymePerform(body);
        case 'CancelTransaction':
          return await this.paymeCancel(body);
        case 'CheckTransaction':
          return await this.paymeCheck(body);
        case 'GetStatement':
          return await this.paymeStatement(body);
        default:
          return paymeFailure(body?.id, PAYME_ERROR.METHOD_NOT_FOUND, body?.method);
      }
    } catch (error) {
      // Kutilmagan xatoda ham 200 + JSON-RPC error qaytaramiz.
      // 500 bo'lsa Payme so'rovni cheksiz qayta yuboradi.
      this.logger.error({ err: error, method: body?.method }, 'Payme webhook xatosi');
      return paymeFailure(body?.id, PAYME_ERROR.UNABLE_TO_PERFORM);
    }
  }

  /** Bu to'lovni qabul qila olamizmi. */
  private async paymeCheckPerform(body: PaymeRpcRequest): Promise<unknown> {
    const paymentId = extractPaymentId(body.params);
    if (!paymentId) return paymeFailure(body.id, PAYME_ERROR.ORDER_NOT_FOUND);

    const payment = await this.payments.getById(paymentId).catch(() => undefined);
    if (!payment) return paymeFailure(body.id, PAYME_ERROR.ORDER_NOT_FOUND);

    if (toTiyin(String(body.params?.amount ?? 0)) !== toTiyin(payment.amountTiyin)) {
      return paymeFailure(body.id, PAYME_ERROR.INVALID_AMOUNT);
    }
    if (payment.status === 'PAID') {
      return paymeFailure(body.id, PAYME_ERROR.ORDER_ALREADY_PAID);
    }
    if (payment.status === 'CANCELLED' || payment.status === 'REFUNDED') {
      return paymeFailure(body.id, PAYME_ERROR.ORDER_STATE_INVALID);
    }

    return paymeSuccess(body.id, { allow: true });
  }

  /** Tranzaksiya yaratish. */
  private async paymeCreate(body: PaymeRpcRequest): Promise<unknown> {
    const paymeTxnId = String(body.params?.id ?? '');
    const paymentId = extractPaymentId(body.params);
    if (!paymentId) return paymeFailure(body.id, PAYME_ERROR.ORDER_NOT_FOUND);

    const payment = await this.payments.getById(paymentId).catch(() => undefined);
    if (!payment) return paymeFailure(body.id, PAYME_ERROR.ORDER_NOT_FOUND);

    if (toTiyin(String(body.params?.amount ?? 0)) !== toTiyin(payment.amountTiyin)) {
      return paymeFailure(body.id, PAYME_ERROR.INVALID_AMOUNT);
    }

    // Takroriy CreateTransaction — o'sha javobni qaytaramiz (idempotent)
    if (payment.providerTxnId === paymeTxnId) {
      if (payment.status === 'CANCELLED') {
        return paymeFailure(body.id, PAYME_ERROR.UNABLE_TO_PERFORM);
      }
      return paymeSuccess(body.id, {
        create_time: paymeTime(payment.createdAt),
        transaction: payment.id,
        state: payment.status === 'PAID' ? PAYME_STATE.PERFORMED : PAYME_STATE.CREATED,
      });
    }

    // Boshqa tranzaksiya bilan band bo'lsa
    if (payment.providerTxnId && payment.providerTxnId !== paymeTxnId) {
      return paymeFailure(body.id, PAYME_ERROR.ORDER_ALREADY_PAID);
    }
    if (payment.status === 'PAID') {
      return paymeFailure(body.id, PAYME_ERROR.ORDER_ALREADY_PAID);
    }

    await this.database.db
      .updateTable('payments')
      .set({ providerTxnId: paymeTxnId, status: 'PENDING', updatedAt: new Date() })
      .where('id', '=', paymentId)
      .execute();

    return paymeSuccess(body.id, {
      create_time: paymeTime(payment.createdAt),
      transaction: payment.id,
      state: PAYME_STATE.CREATED,
    });
  }

  /** Pulni yechish. */
  private async paymePerform(body: PaymeRpcRequest): Promise<unknown> {
    const payment = await this.findByPaymeTxn(String(body.params?.id ?? ''));
    if (!payment) return paymeFailure(body.id, PAYME_ERROR.TRANSACTION_NOT_FOUND);

    if (payment.status === 'PAID') {
      // Idempotent: qayta chaqirilsa o'sha natijani qaytaramiz
      return paymeSuccess(body.id, {
        transaction: payment.id,
        perform_time: paymeTime(payment.paidAt),
        state: PAYME_STATE.PERFORMED,
      });
    }

    if (payment.status !== 'PENDING' && payment.status !== 'CREATED') {
      return paymeFailure(body.id, PAYME_ERROR.UNABLE_TO_PERFORM);
    }

    // 12 soatlik muddat — Payme qoidasi
    if (isPaymeTimedOut(payment.createdAt)) {
      await this.payments.markCancelled(payment.id, 'Payme: muddat oʻtdi', body);
      return paymeFailure(body.id, PAYME_ERROR.UNABLE_TO_PERFORM);
    }

    await this.payments.markPaid(payment.id, {
      providerTxnId: payment.providerTxnId ?? undefined,
      rawCallback: body,
    });

    const updated = await this.payments.getById(payment.id);

    return paymeSuccess(body.id, {
      transaction: payment.id,
      perform_time: paymeTime(updated?.paidAt ?? new Date()),
      state: PAYME_STATE.PERFORMED,
    });
  }

  /** Bekor qilish. */
  private async paymeCancel(body: PaymeRpcRequest): Promise<unknown> {
    const payment = await this.findByPaymeTxn(String(body.params?.id ?? ''));
    if (!payment) return paymeFailure(body.id, PAYME_ERROR.TRANSACTION_NOT_FOUND);

    const wasPaid = payment.status === 'PAID';

    if (payment.status !== 'CANCELLED' && payment.status !== 'REFUNDED') {
      await this.payments.markCancelled(
        payment.id,
        `Payme bekor qildi (reason: ${String(body.params?.reason ?? '')})`,
        body,
      );
    }

    return paymeSuccess(body.id, {
      transaction: payment.id,
      cancel_time: Date.now(),
      state: wasPaid ? PAYME_STATE.CANCELLED_AFTER_PERFORM : PAYME_STATE.CANCELLED_BEFORE_PERFORM,
    });
  }

  /** Holatni so'rash. */
  private async paymeCheck(body: PaymeRpcRequest): Promise<unknown> {
    const payment = await this.findByPaymeTxn(String(body.params?.id ?? ''));
    if (!payment) return paymeFailure(body.id, PAYME_ERROR.TRANSACTION_NOT_FOUND);

    const cancelled = payment.status === 'CANCELLED' || payment.status === 'REFUNDED';
    const state = payment.status === 'PAID'
      ? PAYME_STATE.PERFORMED
      : cancelled
        ? payment.status === 'REFUNDED'
          ? PAYME_STATE.CANCELLED_AFTER_PERFORM
          : PAYME_STATE.CANCELLED_BEFORE_PERFORM
        : PAYME_STATE.CREATED;

    return paymeSuccess(body.id, {
      create_time: paymeTime(payment.createdAt),
      perform_time: paymeTime(payment.paidAt),
      cancel_time: cancelled ? paymeTime(payment.updatedAt) : 0,
      transaction: payment.id,
      state,
      reason: null,
    });
  }

  /** Davr bo'yicha tranzaksiyalar — Payme solishtirish uchun so'raydi. */
  private async paymeStatement(body: PaymeRpcRequest): Promise<unknown> {
    const from = new Date(Number(body.params?.from ?? 0));
    const to = new Date(Number(body.params?.to ?? Date.now()));

    const rows = await this.database.db
      .selectFrom('payments')
      .select([
        'id',
        'providerTxnId',
        'amountTiyin',
        'status',
        'createdAt',
        'paidAt',
        'updatedAt',
        'userId',
      ])
      .where('provider', '=', 'PAYME')
      .where('providerTxnId', 'is not', null)
      .where('createdAt', '>=', from)
      .where('createdAt', '<=', to)
      .orderBy('createdAt', 'asc')
      .execute();

    return paymeSuccess(body.id, {
      transactions: rows.map((row) => ({
        id: row.providerTxnId,
        time: paymeTime(row.createdAt),
        amount: Number(row.amountTiyin),
        account: { payment_id: row.id },
        create_time: paymeTime(row.createdAt),
        perform_time: paymeTime(row.paidAt),
        cancel_time:
          row.status === 'CANCELLED' || row.status === 'REFUNDED' ? paymeTime(row.updatedAt) : 0,
        transaction: row.id,
        state:
          row.status === 'PAID'
            ? PAYME_STATE.PERFORMED
            : row.status === 'CANCELLED'
              ? PAYME_STATE.CANCELLED_BEFORE_PERFORM
              : row.status === 'REFUNDED'
                ? PAYME_STATE.CANCELLED_AFTER_PERFORM
                : PAYME_STATE.CREATED,
        reason: null,
      })),
    });
  }

  private async findByPaymeTxn(paymeTxnId: string) {
    if (!paymeTxnId) return undefined;

    return this.database.db
      .selectFrom('payments')
      .selectAll()
      .where('provider', '=', 'PAYME')
      .where('providerTxnId', '=', paymeTxnId)
      .executeTakeFirst();
  }
}

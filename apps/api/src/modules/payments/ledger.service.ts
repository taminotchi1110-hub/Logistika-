import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { SettingsService } from '@/common/services/settings.service';
import { toTiyin } from '@/common/utils/money.util';
import { DatabaseService } from '@/infra/database/database.service';
import type { Database, LedgerAccountType } from '@/infra/database/database.types';

/** Ledger yozuvining turi — hisobotlar shu bo'yicha guruhlanadi. */
export type EntryType =
  | 'TOPUP' // hamyonni to'ldirish
  | 'ESCROW_HOLD' // buyurtma summasi bloklandi
  | 'ESCROW_RELEASE' // buyurtma yakunlandi, pul chiqarildi
  | 'ESCROW_REFUND' // buyurtma bekor qilindi, pul qaytdi
  | 'COMMISSION' // platforma daromadi
  | 'PAYOUT' // haydovchiga to'lov
  | 'PAYOUT_REVERSAL' // to'lov amalga oshmadi, qaytarildi
  | 'PENALTY' // bekor qilish jarimasi
  | 'BONUS' // referal, aksiya
  | 'SUBSCRIPTION' // obuna to'lovi
  | 'ADJUSTMENT'; // admin qo'lda tuzatishi

/** Bitta hisobga bitta harakat. */
export interface LedgerLeg {
  accountId: string;
  /** + kirim, − chiqim. Nol bo'lishi mumkin emas. */
  amountTiyin: bigint;
}

export interface TransferInput {
  legs: LedgerLeg[];
  entryType: EntryType;
  orderId?: string | null;
  paymentId?: string | null;
  description?: string;
  meta?: Record<string, unknown>;
  /** Takroriy chaqiruvda ikkinchi marta yozilmasligi uchun. */
  idempotencyKey?: string;
}

export interface AccountView {
  id: string;
  type: LedgerAccountType;
  balanceTiyin: string;
  creditLimitTiyin: string;
  isLocked: boolean;
}

/**
 * Ikki yozuvli buxgalteriya (double-entry).
 *
 * NEGA SHUNDAY, "balansga qo'shib qo'yish" EMAS:
 *
 *   1. **Pul yo'qolmaydi.** Har bir operatsiyada yozuvlar yig'indisi
 *      nolga teng — pul bir hisobdan ikkinchisiga o'tadi, yo'qdan
 *      paydo bo'lmaydi. Buni DEFERRABLE trigger baza darajasida
 *      tekshiradi: balanslanmagan tranzaksiya COMMIT bo'la olmaydi.
 *
 *   2. **Tarix o'zgarmaydi.** `ledger_entries` append-only (UPDATE va
 *      DELETE trigger bilan taqiqlangan). Xato tuzatilsa ham yangi
 *      teskari yozuv qo'shiladi — eski yozuv joyida qoladi. Auditda
 *      "kim, qachon, nima uchun" savoliga javob bor.
 *
 *   3. **Balans qayta hisoblanadi.** `ledger_accounts.balance_tiyin` —
 *      denormalizatsiya (tezlik uchun). Haqiqat manbai — yozuvlar
 *      yig'indisi. Ikkalasi farq qilsa, bu buzilish belgisi.
 *
 * Barcha pul harakatlari FAQAT shu servis orqali o'tadi.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Foydalanuvchi hamyonini qaytaradi, bo'lmasa yaratadi.
   *
   * `ON CONFLICT` bilan: ikki so'rov bir vaqtda kelsa ham bitta hisob
   * yaratiladi (`uq_ledger_user_wallet` qisman unikal indeksi).
   */
  async ensureWallet(userId: string, trx?: Transaction<Database>): Promise<AccountView> {
    const db = trx ?? this.database.db;

    const existing = await db
      .selectFrom('ledgerAccounts')
      .select(['id', 'type', 'balanceTiyin', 'creditLimitTiyin', 'isLocked'])
      .where('userId', '=', userId)
      .where('type', '=', 'USER_WALLET')
      .executeTakeFirst();

    if (existing) return existing;

    // Kredit limiti sozlamadan olinadi: naqd buyurtmada komissiya
    // haydovchi hamyonidan yechiladi va u vaqtincha manfiyga tushishi
    // KERAK (pul haydovchida naqd, platformaga hali o'tkazilmagan).
    // Limitsiz hamyonda bu operatsiya "mablag' yetarli emas" bilan
    // yiqilar va platforma daromadini jimgina yo'qotardi (migratsiya 0004).
    const creditLimit = await this.walletCreditLimit();

    const created = await db
      .insertInto('ledgerAccounts')
      .values({ type: 'USER_WALLET', userId, creditLimitTiyin: creditLimit.toString() })
      .returning(['id', 'type', 'balanceTiyin', 'creditLimitTiyin', 'isLocked'])
      .executeTakeFirst();

    if (created) return created;

    // Poyga: boshqa so'rov bizdan oldin yaratib ulgurdi
    const raced = await db
      .selectFrom('ledgerAccounts')
      .select(['id', 'type', 'balanceTiyin', 'creditLimitTiyin', 'isLocked'])
      .where('userId', '=', userId)
      .where('type', '=', 'USER_WALLET')
      .executeTakeFirstOrThrow();

    return raced;
  }

  /**
   * Tizim hisobini qaytaradi (ESCROW, PLATFORM_REVENUE va h.k.).
   *
   * Bu hisoblar bitta nusxada bo'ladi va `user_id` siz.
   */
  async systemAccount(
    type: Exclude<LedgerAccountType, 'USER_WALLET'>,
    trx?: Transaction<Database>,
  ): Promise<AccountView> {
    const db = trx ?? this.database.db;

    const existing = await db
      .selectFrom('ledgerAccounts')
      .select(['id', 'type', 'balanceTiyin', 'creditLimitTiyin', 'isLocked'])
      .where('type', '=', type)
      .where('userId', 'is', null)
      .executeTakeFirst();

    if (existing) return existing;

    return db
      .insertInto('ledgerAccounts')
      .values({
        type,
        userId: null,
        // Tizim hisoblari manfiy bo'lishi normal: ESCROW dan pul
        // chiqarilganda u vaqtincha manfiyga tushishi mumkin emas, lekin
        // PSP_CLEARING kelayotgan pulni kutayotganda manfiy turadi
        creditLimitTiyin: '9223372036854775807',
      })
      .returning(['id', 'type', 'balanceTiyin', 'creditLimitTiyin', 'isLocked'])
      .executeTakeFirstOrThrow();
  }

  /**
   * Pul o'tkazish — barcha moliyaviy operatsiyalarning yagona yo'li.
   *
   * Bitta tranzaksiyada:
   *   1. Hisoblar QULFLANADI (`FOR UPDATE`) — bir vaqtda ikki o'tkazma
   *      bir hisobga tegsa, ular navbat bilan bajariladi
   *   2. Balans yetarliligi tekshiriladi
   *   3. Yozuvlar qo'shiladi (`balance_after` bilan)
   *   4. Hisob balansi yangilanadi
   *
   * Qulflash tartibi — `accountId` bo'yicha SARALANGAN. Bu deadlock'ning
   * oldini oladi: ikki parallel o'tkazma A→B va B→A bo'lsa, ikkalasi ham
   * hisoblarni bir xil tartibda qulflaydi.
   */
  async transfer(input: TransferInput): Promise<{ transactionId: string; skipped: boolean }> {
    this.assertBalanced(input.legs);

    return this.database.db.transaction().execute(async (trx) => {
      if (input.idempotencyKey) {
        const already = await trx
          .selectFrom('ledgerEntries')
          .select('transactionId')
          .where(sql`meta->>'idempotencyKey'`, '=', input.idempotencyKey)
          .executeTakeFirst();

        if (already) {
          this.logger.debug(
            { idempotencyKey: input.idempotencyKey },
            'Takroriy oʻtkazma oʻtkazib yuborildi',
          );
          return { transactionId: already.transactionId, skipped: true };
        }
      }

      const transactionId = randomUUID();
      const sorted = [...input.legs].sort((a, b) => a.accountId.localeCompare(b.accountId));

      for (const leg of sorted) {
        const account = await trx
          .selectFrom('ledgerAccounts')
          .select(['id', 'balanceTiyin', 'creditLimitTiyin', 'isLocked'])
          .where('id', '=', leg.accountId)
          .forUpdate()
          .executeTakeFirst();

        if (!account) {
          throw AppError.badRequest(ErrorCode.WALLET_ACCOUNT_NOT_FOUND, 'Hisob topilmadi');
        }
        if (account.isLocked) {
          throw AppError.conflict(ErrorCode.WALLET_LOCKED, 'Hisob bloklangan');
        }

        const before = toTiyin(account.balanceTiyin);
        const after = before + leg.amountTiyin;
        const limit = toTiyin(account.creditLimitTiyin);

        // Manfiy balansga faqat kredit limiti doirasida ruxsat
        if (after < -limit) {
          throw AppError.conflict(ErrorCode.WALLET_INSUFFICIENT_FUNDS, 'Mablagʻ yetarli emas', {
            balanceTiyin: before.toString(),
            requiredTiyin: (-leg.amountTiyin).toString(),
            creditLimitTiyin: limit.toString(),
          });
        }

        await trx
          .insertInto('ledgerEntries')
          .values({
            transactionId,
            accountId: leg.accountId,
            amountTiyin: leg.amountTiyin.toString(),
            balanceAfterTiyin: after.toString(),
            entryType: input.entryType,
            orderId: input.orderId ?? null,
            paymentId: input.paymentId ?? null,
            description: input.description ?? null,
            meta: JSON.stringify({
              ...(input.meta ?? {}),
              ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
            }),
          })
          .execute();

        await trx
          .updateTable('ledgerAccounts')
          .set({ balanceTiyin: after.toString(), updatedAt: new Date() })
          .where('id', '=', leg.accountId)
          .execute();
      }

      this.logger.log(
        {
          transactionId,
          entryType: input.entryType,
          orderId: input.orderId,
          legs: input.legs.length,
        },
        'Ledger oʻtkazmasi',
      );

      return { transactionId, skipped: false };
    });
  }

  /** Hamyon balansi va oxirgi harakatlar. */
  async balance(userId: string): Promise<{ balanceTiyin: string; creditLimitTiyin: string }> {
    const wallet = await this.ensureWallet(userId);
    return {
      balanceTiyin: wallet.balanceTiyin,
      creditLimitTiyin: wallet.creditLimitTiyin,
    };
  }

  async history(
    userId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<
    {
      id: string;
      amountTiyin: string;
      balanceAfterTiyin: string;
      entryType: string;
      orderId: string | null;
      description: string | null;
      createdAt: Date;
    }[]
  > {
    const wallet = await this.ensureWallet(userId);

    let query = this.database.db
      .selectFrom('ledgerEntries')
      .select([
        'id',
        'amountTiyin',
        'balanceAfterTiyin',
        'entryType',
        'orderId',
        'description',
        'createdAt',
      ])
      .where('accountId', '=', wallet.id);

    if (options.before) {
      query = query.where('createdAt', '<', new Date(options.before));
    }

    return query
      .orderBy('createdAt', 'desc')
      .limit(options.limit ?? 30)
      .execute();
  }

  /**
   * Hisob balansi yozuvlar yig'indisiga mos keladimi.
   *
   * NEGA KERAK: `balance_tiyin` — denormalizatsiya. Agar u yozuvlardan
   * farq qilsa, demak kimdir uni ledger'dan chetlab o'tib o'zgartirgan
   * yoki tranzaksiya yarim bajarilgan. Bu moliyaviy tizimda eng jiddiy
   * xato turi, shuning uchun kunlik cron shu tekshiruvni bajaradi.
   */
  async verifyIntegrity(): Promise<{ ok: boolean; mismatches: { accountId: string; stored: string; computed: string }[] }> {
    const result = await sql<{ accountId: string; stored: string; computed: string }>`
      SELECT a.id                                   AS account_id,
             a.balance_tiyin                        AS stored,
             COALESCE(SUM(e.amount_tiyin), 0)::text AS computed
        FROM ledger_accounts a
        LEFT JOIN ledger_entries e ON e.account_id = a.id
       GROUP BY a.id, a.balance_tiyin
      HAVING a.balance_tiyin <> COALESCE(SUM(e.amount_tiyin), 0)
    `.execute(this.database.db);

    if (result.rows.length > 0) {
      this.logger.error(
        { count: result.rows.length, accounts: result.rows.map((r) => r.accountId) },
        'LEDGER BUZILGAN: balans yozuvlar yigʻindisiga mos kelmaydi',
      );
    }

    return { ok: result.rows.length === 0, mismatches: result.rows };
  }

  /**
   * Hamyon uchun ruxsat etilgan manfiy qoldiq (musbat son sifatida).
   *
   * Sozlama manfiy yozilgan (`-20000000`), lekin `credit_limit_tiyin`
   * musbat saqlanadi — shuning uchun moduli olinadi.
   */
  private async walletCreditLimit(): Promise<bigint> {
    const value = await this.settings.getNumber('wallet.negative_limit_tiyin', -20_000_000);
    return BigInt(Math.abs(Math.round(value)));
  }

  /** Yozuvlar yig'indisi nolga tengmi — bazaga bormay tekshiramiz. */
  private assertBalanced(legs: LedgerLeg[]): void {
    if (legs.length < 2) {
      throw new Error('Oʻtkazmada kamida ikkita yozuv boʻlishi kerak');
    }

    const sum = legs.reduce((acc, leg) => acc + leg.amountTiyin, 0n);
    if (sum !== 0n) {
      throw new Error(`Oʻtkazma balanslanmagan: yigʻindi ${sum} tiyin`);
    }

    if (legs.some((leg) => leg.amountTiyin === 0n)) {
      throw new Error('Nol summali yozuv boʻlishi mumkin emas');
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { SettingsService } from '@/common/services/settings.service';
import { formatSoum, percentOf, toTiyin } from '@/common/utils/money.util';
import { DatabaseService } from '@/infra/database/database.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

import { LedgerService } from './ledger.service';

/**
 * Buyurtma pul oqimi.
 *
 * O'ZBEKISTON REALLIGI: bozorning katta qismi naqd pul bilan ishlaydi.
 * Shuning uchun ikkita sxema qo'llab-quvvatlanadi va ular pul yo'li
 * bo'yicha tubdan farq qiladi:
 *
 * ┌─ ESCROW (kafolatli to'lov) ─────────────────────────────────────┐
 * │ Buyurtma tuzilganda:  Mijoz hamyoni → ESCROW                    │
 * │ Yakunlanganda:        ESCROW → Haydovchi hamyoni (narx−komissiya)│
 * │                       ESCROW → PLATFORM_REVENUE (komissiya)      │
 * │ Bekor qilinganda:     ESCROW → Mijoz hamyoni (jarima chegirilib) │
 * │                                                                  │
 * │ Ikkala tomon himoyalangan: mijozning puli haydovchi yukni       │
 * │ topshirmaguncha o'tmaydi, haydovchi esa pul borligini biladi.   │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NAQD ──────────────────────────────────────────────────────────┐
 * │ Buyurtma tuzilganda:  hech narsa                                 │
 * │ Yakunlanganda:        Haydovchi hamyoni → PLATFORM_REVENUE       │
 * │                       (faqat komissiya)                          │
 * │                                                                  │
 * │ Pul mijozdan haydovchiga to'g'ridan-to'g'ri o'tadi. Platforma   │
 * │ faqat komissiyani haydovchi hamyonidan yechadi. Hamyon MANFIY   │
 * │ bo'lishi mumkin (kredit limiti doirasida) — haydovchi keyin     │
 * │ to'ldiradi. Limitga yetganda yangi buyurtma ola olmaydi.        │
 * └──────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Haydovchi yangi buyurtma ola oladimi — hamyon qarzi tekshiriladi.
   *
   * NEGA KERAK: naqd sxemada komissiya haydovchi hamyonidan yechiladi
   * va u manfiyga tushadi. Cheklovsiz bu "cheksiz kredit" bo'lib
   * qolardi. Limitga yetgan haydovchi avval qarzini yopishi kerak.
   */
  async canDriverTakeOrders(driverId: string): Promise<{
    allowed: boolean;
    balanceTiyin: string;
    limitTiyin: string;
    debtToPayTiyin: string;
  }> {
    const wallet = await this.ledger.ensureWallet(driverId);
    const balance = toTiyin(wallet.balanceTiyin);

    // Limit HISOBNING O'ZIDAN olinadi, global sozlamadan emas.
    //
    // NEGA: ledger o'tkazmani aynan `credit_limit_tiyin` bo'yicha
    // to'xtatadi. Agar bu tekshiruv global sozlamani o'qisa, ikkalasi
    // bir-biriga zid javob berardi: "buyurtma olishingiz mumkin"
    // deb aytib, keyin komissiyani yecha olmasdik. Bundan tashqari
    // admin ishonchli haydovchiga limitni alohida oshira oladi.
    const limit = -toTiyin(wallet.creditLimitTiyin);

    return {
      allowed: balance > limit,
      balanceTiyin: balance.toString(),
      limitTiyin: limit.toString(),
      // Limitdan qancha oshgani — shuncha to'lash kerak
      debtToPayTiyin: balance <= limit ? (limit - balance).toString() : '0',
    };
  }

  /**
   * Buyurtma tuzilganda pulni bloklaydi (faqat ESCROW).
   *
   * Mablag' yetmasa buyurtma TUZILMAYDI: haydovchi behuda yo'lga
   * chiqmasligi kerak. Bu `acceptOffer` tranzaksiyasidan tashqarida
   * chaqiriladi, chunki ledger o'z tranzaksiyasini ochadi.
   */
  async hold(input: {
    orderId: string;
    shipperId: string;
    priceTiyin: bigint;
    paymentMethod: string;
  }): Promise<{ held: boolean }> {
    if (input.paymentMethod !== 'ESCROW') return { held: false };

    const wallet = await this.ledger.ensureWallet(input.shipperId);
    const escrow = await this.ledger.systemAccount('ESCROW');

    const balance = toTiyin(wallet.balanceTiyin);
    if (balance < input.priceTiyin) {
      throw AppError.conflict(
        ErrorCode.WALLET_INSUFFICIENT_FUNDS,
        `Hamyonda mablagʻ yetarli emas. Kerak: ${formatSoum(input.priceTiyin)}, bor: ${formatSoum(balance)}`,
        {
          requiredTiyin: input.priceTiyin.toString(),
          balanceTiyin: balance.toString(),
        },
      );
    }

    await this.ledger.transfer({
      legs: [
        { accountId: wallet.id, amountTiyin: -input.priceTiyin },
        { accountId: escrow.id, amountTiyin: input.priceTiyin },
      ],
      entryType: 'ESCROW_HOLD',
      orderId: input.orderId,
      description: 'Buyurtma summasi bloklandi',
      idempotencyKey: `escrow-hold:${input.orderId}`,
    });

    await this.database.db
      .updateTable('orders')
      .set({ paymentStatus: 'HELD' })
      .where('id', '=', input.orderId)
      .execute();

    this.logger.log(
      { orderId: input.orderId, amountTiyin: input.priceTiyin.toString() },
      'Escrow bloklandi',
    );

    return { held: true };
  }

  /**
   * Buyurtma yakunlanganda pulni taqsimlaydi.
   *
   * Idempotent: `COMPLETED` ga ikki marta o'tib bo'lmaydi (state
   * machine buni to'xtatadi), lekin ledger darajasida ham himoya bor.
   */
  async release(orderId: string): Promise<{ released: boolean }> {
    const order = await this.database.db
      .selectFrom('orders')
      .select([
        'id',
        'shipperId',
        'driverId',
        'priceTiyin',
        'commissionTiyin',
        'driverPayoutTiyin',
        'paymentMethod',
        'paymentStatus',
      ])
      .where('id', '=', orderId)
      .executeTakeFirst();

    if (!order) throw AppError.notFound('Buyurtma topilmadi');
    if (order.paymentStatus === 'PAID') return { released: false };

    const commission = toTiyin(order.commissionTiyin);
    const payout = toTiyin(order.driverPayoutTiyin);
    const price = toTiyin(order.priceTiyin);

    const driverWallet = await this.ledger.ensureWallet(order.driverId);
    const revenue = await this.ledger.systemAccount('PLATFORM_REVENUE');

    if (order.paymentMethod === 'ESCROW') {
      const escrow = await this.ledger.systemAccount('ESCROW');

      // Bitta tranzaksiyada uch yozuv: escrow'dan chiqadi, haydovchiga
      // va platformaga bo'linadi. Yig'indi nol — trigger tekshiradi.
      await this.ledger.transfer({
        legs: [
          { accountId: escrow.id, amountTiyin: -price },
          { accountId: driverWallet.id, amountTiyin: payout },
          ...(commission > 0n ? [{ accountId: revenue.id, amountTiyin: commission }] : []),
        ],
        entryType: 'ESCROW_RELEASE',
        orderId,
        description: 'Buyurtma yakunlandi',
        idempotencyKey: `escrow-release:${orderId}`,
      });
    } else if (commission > 0n) {
      // Naqd: pul haydovchida, platforma faqat komissiyani yechadi.
      // Hamyon manfiyga tushishi mumkin — kredit limiti doirasida.
      await this.ledger.transfer({
        legs: [
          { accountId: driverWallet.id, amountTiyin: -commission },
          { accountId: revenue.id, amountTiyin: commission },
        ],
        entryType: 'COMMISSION',
        orderId,
        description: 'Naqd buyurtma komissiyasi',
        idempotencyKey: `commission:${orderId}`,
      });
    }

    await this.database.db
      .updateTable('orders')
      .set({ paymentStatus: 'PAID' })
      .where('id', '=', orderId)
      .execute();

    // Haydovchining umumiy daromadi (profil statistikasi)
    await this.database.db
      .updateTable('driverProfiles')
      .set((eb) => ({
        totalEarnedTiyin: eb('totalEarnedTiyin', '+', payout.toString()),
      }))
      .where('userId', '=', order.driverId)
      .execute();

    this.logger.log(
      {
        orderId,
        method: order.paymentMethod,
        payoutTiyin: payout.toString(),
        commissionTiyin: commission.toString(),
      },
      'Buyurtma toʻlovi yakunlandi',
    );

    await this.notifications.notify({
      userId: order.driverId,
      type: 'payment.received',
      title: 'Toʻlov hisobingizga tushdi',
      body:
        order.paymentMethod === 'ESCROW'
          ? `${formatSoum(payout)} hamyoningizga oʻtkazildi`
          : `Komissiya yechildi: ${formatSoum(commission)}`,
      entityType: 'ORDER',
      entityId: orderId,
      deepLink: 'karvon://wallet',
      dedupeKey: `release:${orderId}`,
    });

    return { released: true };
  }

  /**
   * Buyurtma bekor qilinganda pulni qaytaradi.
   *
   * JARIMA: haydovchi tasdiqlagandan keyin bekor qilinsa, mijozning
   * vaqti va haydovchining yo'li behuda ketadi. Jarima aybdor tomondan
   * olinadi va platformaga emas, JABRLANGAN tomonga o'tadi — bu
   * adolatli va platformani "bekor qilishdan manfaatdor" qilib
   * qo'ymaydi.
   */
  async refund(input: {
    orderId: string;
    cancelledBy: 'SHIPPER' | 'DRIVER' | 'ADMIN';
    hadStarted: boolean;
  }): Promise<{ refunded: boolean; penaltyTiyin: string }> {
    const order = await this.database.db
      .selectFrom('orders')
      .select(['id', 'shipperId', 'driverId', 'priceTiyin', 'paymentMethod', 'paymentStatus'])
      .where('id', '=', input.orderId)
      .executeTakeFirst();

    if (!order) throw AppError.notFound('Buyurtma topilmadi');

    const price = toTiyin(order.priceTiyin);
    const penaltyRate = await this.settings.getNumber('cancel.penalty_rate', 0.1);

    // Jarima faqat reys boshlangandan keyin va admin bekor qilmagan bo'lsa
    const penalty =
      input.hadStarted && input.cancelledBy !== 'ADMIN' ? percentOf(price, penaltyRate) : 0n;

    const shipperWallet = await this.ledger.ensureWallet(order.shipperId);
    const driverWallet = await this.ledger.ensureWallet(order.driverId);

    // Aybdor va jabrlangan. Jarima platformaga EMAS, jabrlangan tomonga
    // o'tadi — aks holda platforma bekor qilishdan manfaatdor bo'lib
    // qolardi va bu noto'g'ri rag'bat yaratadi.
    const guilty = input.cancelledBy === 'SHIPPER' ? shipperWallet : driverWallet;
    const victim = input.cancelledBy === 'SHIPPER' ? driverWallet : shipperWallet;

    const shouldRefundEscrow =
      order.paymentMethod === 'ESCROW' && order.paymentStatus === 'HELD';

    // Ikki mustaqil harakat, bitta tranzaksiyada:
    //   1. Bloklangan pul TO'LIQ mijozga qaytadi (bu uning o'z puli)
    //   2. Jarima aybdor hamyonidan jabrlanganga o'tadi
    //
    // Ilgari bular aralashtirilgan edi va haydovchi bekor qilganda
    // jarima escrow'dan (ya'ni mijozning o'z pulidan) olinardi —
    // natijada aybdor hech narsa to'lamasdi.
    const legs = [
      ...(shouldRefundEscrow
        ? [
            { accountId: (await this.ledger.systemAccount('ESCROW')).id, amountTiyin: -price },
            { accountId: shipperWallet.id, amountTiyin: price },
          ]
        : []),
      ...(penalty > 0n
        ? [
            { accountId: guilty.id, amountTiyin: -penalty },
            { accountId: victim.id, amountTiyin: penalty },
          ]
        : []),
    ];

    if (legs.length === 0) {
      return { refunded: false, penaltyTiyin: '0' };
    }

    await this.ledger.transfer({
      legs,
      entryType: shouldRefundEscrow ? 'ESCROW_REFUND' : 'PENALTY',
      orderId: input.orderId,
      description:
        penalty > 0n
          ? `Bekor qilindi (${input.cancelledBy}), jarima ${formatSoum(penalty)}`
          : `Bekor qilindi (${input.cancelledBy})`,
      idempotencyKey: `escrow-refund:${input.orderId}`,
      meta: { cancelledBy: input.cancelledBy, penaltyTiyin: penalty.toString() },
    });

    if (shouldRefundEscrow) {
      await this.database.db
        .updateTable('orders')
        .set({ paymentStatus: 'REFUNDED' })
        .where('id', '=', input.orderId)
        .execute();
    }

    return { refunded: shouldRefundEscrow, penaltyTiyin: penalty.toString() };
  }

}

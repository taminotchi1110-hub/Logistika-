import { Injectable, Logger } from '@nestjs/common';

import { maskPhone } from '@/common/utils/phone.util';
import { DatabaseService } from '@/infra/database/database.service';
import { StorageService } from '@/infra/storage/storage.service';

/**
 * Bitta bo'limdagi eng ko'p qator.
 *
 * Cheklovsiz eksport bir necha yillik chat va bildirishnomalarni bitta
 * javobga yig'adi — xotira ham, `statement_timeout` ham bunga chidamaydi.
 * Kesilgan bo'lim `truncated: true` bilan belgilanadi, ya'ni foydalanuvchi
 * to'liq emasligini biladi va qo'llab-quvvatlashga murojaat qila oladi.
 */
const MAX_ROWS = 2000;

interface Section<T> {
  count: number;
  truncated: boolean;
  items: T[];
}

function section<T>(items: T[]): Section<T> {
  return { count: items.length, truncated: items.length >= MAX_ROWS, items };
}

/**
 * "Ma'lumotlarimning nusxasini olish" — maxfiylik siyosatining 7-bo'limida
 * va'da qilingan huquq (GDPR 20-modda, O'zbekiston "Shaxsga doir ma'lumotlar
 * to'g'risida"gi qonunining 20-moddasi ham shunga yaqin).
 *
 * NIMA KIRADI: foydalanuvchining o'zi kiritgan va u haqida to'plangan
 * barcha ma'lumot — profil, transport, e'lon va buyurtmalar, yozishmalar,
 * reytinglar, moliyaviy yozuvlar, kirish tarixi.
 *
 * NIMA KIRMAYDI va NEGA:
 *  - refresh token va FCM tokenlari — bular kalit, ma'lumot emas; eksport
 *    fayli qo'lga tushsa ular bilan hisobga kirish mumkin bo'lardi;
 *  - `trackingToken` — jonli kuzatuv havolasining siri;
 *  - to'lov tizimlarining xom javoblari (`raw_request`/`raw_callback`) —
 *    ular ichida karta ma'lumotlari va PSP sirlari bo'lishi mumkin;
 *  - shifrlangan pasport/guvohnoma raqamlari — fayl ochiq holda saqlanadi,
 *    bu maydonlar esa ataylab shifrlangan; ular faqat "saqlangan" belgisi
 *    bilan ko'rsatiladi;
 *  - boshqa tomonning to'liq telefon raqami — u maskalanadi. Buyurtmada
 *    raqam faqat yukni olishga yetib borgach ochiladi va eksport shu
 *    qoidani chetlab o'tishning yo'liga aylanmasligi kerak.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async exportUser(userId: string): Promise<Record<string, unknown>> {
    const db = this.database.db;

    const user = await db
      .selectFrom('users')
      .select([
        'id',
        'phone',
        'role',
        'status',
        'firstName',
        'lastName',
        'middleName',
        'birthDate',
        'email',
        'avatarKey',
        'lang',
        'ratingAvg',
        'ratingCount',
        'completedOrders',
        'cancelledOrders',
        'referralCode',
        'referredBy',
        'lastSeenAt',
        'phoneVerifiedAt',
        'createdAt',
        'updatedAt',
      ])
      .select(['passportNumberEnc', 'pinflEnc'])
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirstOrThrow();

    const { passportNumberEnc, pinflEnc, ...profile } = user;

    const [
      shipperProfile,
      driverProfile,
      vehicles,
      routes,
      addresses,
      documents,
      loads,
      offers,
      orders,
      conversations,
      ratingsGiven,
      ratingsReceived,
      notifications,
      wallet,
      payments,
      payouts,
      sessions,
      loginHistory,
      devices,
      complaints,
    ] = await Promise.all([
      db.selectFrom('shipperProfiles').selectAll().where('userId', '=', userId).executeTakeFirst(),
      db
        .selectFrom('driverProfiles')
        // `current_geom` (PostGIS) va `license_number_enc` ataylab tashqarida
        .select([
          'userId',
          'companyId',
          'licenseCategories',
          'licenseExpiresAt',
          'experienceYears',
          'verificationStatus',
          'verifiedAt',
          'rejectionReason',
          'availability',
          'homeRegionId',
          'acceptsIntercity',
          'acceptsInternational',
          'responseRate',
          'avgResponseSec',
          'onTimeRate',
          'totalDistanceKm',
          'totalEarnedTiyin',
          'isPremium',
          'premiumUntil',
          'createdAt',
        ])
        .where('userId', '=', userId)
        .executeTakeFirst(),
      db
        .selectFrom('vehicles')
        .selectAll()
        .where('driverId', '=', userId)
        .orderBy('createdAt')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('driverRoutes')
        .selectAll()
        .where('driverId', '=', userId)
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('savedAddresses')
        .selectAll()
        .where('userId', '=', userId)
        .limit(MAX_ROWS)
        .execute(),
      this.documents(userId),
      db
        .selectFrom('loads')
        .selectAll()
        .where('shipperId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('orderOffers')
        .selectAll()
        .where('driverId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      this.orders(userId),
      this.conversations(userId),
      db
        .selectFrom('ratings')
        .selectAll()
        .where('raterId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('ratings')
        .select([
          'id',
          'orderId',
          'direction',
          'score',
          'punctuality',
          'communication',
          'cargoCondition',
          'reliability',
          'comment',
          'isVisible',
          'createdAt',
        ])
        .where('ratedId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('notifications')
        .select([
          'id',
          'templateKey',
          'title',
          'body',
          'channel',
          'entityType',
          'entityId',
          'isRead',
          'readAt',
          'sentAt',
          'createdAt',
        ])
        .where('userId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('ledgerAccounts')
        .select(['id', 'type', 'currency', 'balanceTiyin', 'creditLimitTiyin', 'isLocked'])
        .where('userId', '=', userId)
        .execute(),
      db
        .selectFrom('payments')
        // `raw_request` / `raw_callback` tashqarida
        .select([
          'id',
          'orderId',
          'provider',
          'providerTxnId',
          'purpose',
          'amountTiyin',
          'feeTiyin',
          'status',
          'errorCode',
          'paidAt',
          'createdAt',
        ])
        .where('userId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('payouts')
        // `card_token` tashqarida — u bilan pul yechish mumkin; maska qoladi
        .select([
          'id',
          'orderId',
          'amountTiyin',
          'method',
          'cardMask',
          'status',
          'provider',
          'providerTxnId',
          'requestedAt',
          'processedAt',
          'failureReason',
        ])
        .where('driverId', '=', userId)
        .orderBy('requestedAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('userSessions')
        // `refresh_token_hash` tashqarida
        .select([
          'id',
          'deviceId',
          'platform',
          'appVersion',
          'ip',
          'userAgent',
          'createdAt',
          'lastUsedAt',
          'revokedAt',
          'expiresAt',
        ])
        .where('userId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('loginHistory')
        .select(['id', 'success', 'failReason', 'ip', 'userAgent', 'createdAt'])
        .where('userId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('devices')
        // `fcm_token` tashqarida — u push yuborish kaliti
        .select(['id', 'deviceId', 'platform', 'isActive', 'createdAt', 'updatedAt'])
        .where('userId', '=', userId)
        .limit(MAX_ROWS)
        .execute(),
      db
        .selectFrom('complaints')
        .select([
          'id',
          'orderId',
          'category',
          'subject',
          'description',
          'status',
          'resolution',
          'resolvedAt',
          'createdAt',
        ])
        .where('reporterId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(MAX_ROWS)
        .execute(),
    ]);

    const walletIds = wallet.map((account) => account.id);
    const ledgerEntries =
      walletIds.length === 0
        ? []
        : await db
            .selectFrom('ledgerEntries')
            .select([
              'id',
              'accountId',
              'amountTiyin',
              'balanceAfterTiyin',
              'entryType',
              'orderId',
              'paymentId',
              'description',
              'createdAt',
            ])
            .where('accountId', 'in', walletIds)
            .orderBy('createdAt', 'desc')
            .limit(MAX_ROWS)
            .execute();

    this.logger.log({ userId }, 'Maʼlumotlar eksporti tayyorlandi');

    return {
      meta: {
        format: 'karvon-export-v1',
        generatedAt: new Date().toISOString(),
        userId,
        maxRowsPerSection: MAX_ROWS,
        note:
          'Faylda shaxsiy maʼlumotlar bor — uni begonaga bermang. Hujjat ' +
          'havolalari qisqa muddat ichida ishlaydi, keyin yangi eksport oling.',
        excluded: [
          'refresh tokenlar va push tokenlari (kalit, maʼlumot emas)',
          'kuzatuv havolasining maxfiy kaliti',
          'toʻlov tizimlarining xom soʻrov/javoblari',
          'shifrlangan pasport va guvohnoma raqamlari',
          'boshqa tomonlarning toʻliq telefon raqamlari (maskalangan)',
        ],
      },
      profile,
      encryptedFields: {
        note: 'Bu maydonlar bazada shifrlangan saqlanadi, eksportga qiymati qoʻshilmaydi',
        passportNumber: passportNumberEnc !== null,
        pinfl: pinflEnc !== null,
        driverLicenseNumber: await this.hasLicense(userId),
      },
      shipperProfile: shipperProfile ?? null,
      driverProfile: driverProfile ?? null,
      vehicles: section(vehicles),
      driverRoutes: section(routes),
      savedAddresses: section(addresses),
      documents: section(documents),
      loads: section(loads),
      offers: section(offers),
      orders: section(orders),
      conversations: section(conversations),
      ratings: { given: section(ratingsGiven), received: section(ratingsReceived) },
      notifications: section(notifications),
      finance: {
        accounts: wallet,
        ledgerEntries: section(ledgerEntries),
        payments: section(payments),
        payouts: section(payouts),
      },
      security: {
        sessions: section(sessions),
        loginHistory: section(loginHistory),
        devices: section(devices),
      },
      complaints: section(complaints),
    };
  }

  /** Guvohnoma raqami shifrlangan holda bormi — qiymatsiz, faqat belgisi. */
  private async hasLicense(userId: string): Promise<boolean> {
    const row = await this.database.db
      .selectFrom('driverProfiles')
      .select('licenseNumberEnc')
      .where('userId', '=', userId)
      .executeTakeFirst();
    return Boolean(row?.licenseNumberEnc);
  }

  /**
   * Hujjatlar — metama'lumot va yuklab olish havolasi bilan.
   *
   * Havola qisqa muddatli (S3_DOWNLOAD_TTL): eksport fayli begonaga tushsa
   * ham suratlar ochiq qolmaydi. O'chirilgan hujjatlarga havola berilmaydi.
   */
  private async documents(userId: string): Promise<Record<string, unknown>[]> {
    const vehicleIds = this.database.db
      .selectFrom('vehicles')
      .select('id')
      .where('driverId', '=', userId);

    const rows = await this.database.db
      .selectFrom('documents')
      .select([
        'id',
        'ownerType',
        'ownerId',
        'type',
        'fileName',
        'mimeType',
        'sizeBytes',
        'pageSide',
        'verificationStatus',
        'verifiedAt',
        'rejectionReason',
        'expiresAt',
        'createdAt',
        'deletedAt',
        'fileKey',
      ])
      .where((eb) =>
        eb.or([
          eb.and([eb('ownerType', 'in', ['USER', 'DRIVER'] as const), eb('ownerId', '=', userId)]),
          eb.and([eb('ownerType', '=', 'VEHICLE'), eb('ownerId', 'in', vehicleIds)]),
        ]),
      )
      .orderBy('createdAt', 'desc')
      .limit(MAX_ROWS)
      .execute();

    return Promise.all(
      rows.map(async ({ fileKey, ...document }) => ({
        ...document,
        // Havola berilmasa ham qolgan maʼlumot qaytadi: S3 vaqtincha
        // ishlamasligi butun eksportni yoʻqqa chiqarmasligi kerak
        downloadUrl: document.deletedAt
          ? null
          : await this.storage
              .createDownloadUrl(fileKey, document.fileName ?? undefined)
              .catch(() => null),
      })),
    );
  }

  /**
   * Buyurtmalar — ikkinchi tomon nomi bilan, lekin raqami maskalangan.
   */
  private async orders(userId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.database.db
      .selectFrom('orders')
      // `tracking_token` tashqarida
      .select([
        'id',
        'publicNo',
        'loadId',
        'offerId',
        'shipperId',
        'driverId',
        'vehicleId',
        'status',
        'priceTiyin',
        'commissionRate',
        'commissionTiyin',
        'driverPayoutTiyin',
        'paymentMethod',
        'paymentStatus',
        'plannedDistanceKm',
        'actualDistanceKm',
        'plannedDurationMin',
        'confirmedAt',
        'startedAt',
        'pickedUpAt',
        'deliveredAt',
        'completedAt',
        'closedAt',
        'cancelledAt',
        'cancelReason',
        'cancelledBy',
        'penaltyTiyin',
        'createdAt',
      ])
      .where((eb) => eb.or([eb('shipperId', '=', userId), eb('driverId', '=', userId)]))
      .orderBy('createdAt', 'desc')
      .limit(MAX_ROWS)
      .execute();

    const counterparts = await this.people(
      rows.map((order) => (order.shipperId === userId ? order.driverId : order.shipperId)),
    );

    return rows.map((order) => ({
      ...order,
      myRole: order.shipperId === userId ? 'SHIPPER' : 'DRIVER',
      counterpart: counterparts.get(order.shipperId === userId ? order.driverId : order.shipperId),
    }));
  }

  /** Suhbatlar va ulardagi xabarlar (o'chirilganlari ham — matnsiz). */
  private async conversations(userId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.database.db
      .selectFrom('conversations')
      .selectAll()
      .where((eb) => eb.or([eb('shipperId', '=', userId), eb('driverId', '=', userId)]))
      .orderBy('createdAt', 'desc')
      .limit(MAX_ROWS)
      .execute();

    if (rows.length === 0) return [];

    const ids = rows.map((conversation) => conversation.id);
    const messages = await this.database.db
      .selectFrom('messages')
      // `attachment_key` oʻrniga nomi: kalit oʻzi hech narsa bermaydi
      .select([
        'id',
        'conversationId',
        'senderId',
        'type',
        'body',
        'attachmentName',
        'attachmentSize',
        'durationSec',
        'readAt',
        'createdAt',
        'deletedAt',
      ])
      .where('conversationId', 'in', ids)
      .orderBy('createdAt')
      .limit(MAX_ROWS)
      .execute();

    const byConversation = new Map<string, Record<string, unknown>[]>();
    for (const message of messages) {
      const list = byConversation.get(message.conversationId) ?? [];
      list.push({
        ...message,
        mine: message.senderId === userId,
        // Oʻchirilgan xabar matni koʻrsatilmaydi — u ikki tomon uchun ham oʻchgan
        body: message.deletedAt ? null : message.body,
      });
      byConversation.set(message.conversationId, list);
    }

    const counterparts = await this.people(
      rows.map((row) => (row.shipperId === userId ? row.driverId : row.shipperId)),
    );

    return rows.map((conversation) => ({
      ...conversation,
      counterpart: counterparts.get(
        conversation.shipperId === userId ? conversation.driverId : conversation.shipperId,
      ),
      messages: byConversation.get(conversation.id) ?? [],
    }));
  }

  /** Ikkinchi tomonlar: ism ochiq, raqam maskalangan. */
  private async people(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();

    const rows = await this.database.db
      .selectFrom('users')
      .select(['id', 'firstName', 'lastName', 'phone', 'role'])
      .where('id', 'in', unique)
      .execute();

    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          role: row.role,
          phone: maskPhone(row.phone),
        },
      ]),
    );
  }
}

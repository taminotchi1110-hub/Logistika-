import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { SettingsService } from '@/common/services/settings.service';
import { formatSoum, toTiyin } from '@/common/utils/money.util';
import { DatabaseService } from '@/infra/database/database.service';
import type { OrderStatusDb } from '@/infra/database/database.types';
import { StorageService } from '@/infra/storage/storage.service';
import { LedgerService } from '@/modules/payments/ledger.service';
import { PayoutsService } from '@/modules/payments/payouts.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

export interface AuditContext {
  adminId: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Admin paneli amallari.
 *
 * HAR BIR O'ZGARTIRISH AUDITGA YOZILADI: kim, qachon, nima, oldin va
 * keyin qanday edi. Bu shunchaki "yaxshi amaliyot" emas — moliyaviy
 * platformada admin o'zboshimchaligi eng katta ichki xavf. Audit yozuvi
 * bo'lmasa, kim nima qilganini keyin aniqlab bo'lmaydi.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
    private readonly payouts: PayoutsService,
    private readonly notifications: NotificationsService,
    // `StorageModule` global — alohida import kerak emas
    private readonly storage: StorageService,
  ) {}

  // =================================================================
  //  Audit
  // =================================================================

  private async audit(
    ctx: AuditContext,
    action: string,
    entity: { type: string; id: string | null },
    before?: unknown,
    after?: unknown,
    userId?: string,
  ): Promise<void> {
    await this.database.db
      .insertInto('auditLogs')
      .values({
        adminId: ctx.adminId,
        userId: userId ?? null,
        action,
        entityType: entity.type,
        entityId: entity.id,
        before: before === undefined ? null : JSON.stringify(before),
        after: after === undefined ? null : JSON.stringify(after),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      })
      .execute();
  }

  async auditLogs(options: { limit?: number; action?: string; adminId?: string } = {}) {
    let query = this.database.db
      .selectFrom('auditLogs as l')
      .leftJoin('adminUsers as a', 'a.id', 'l.adminId')
      .select([
        'l.id',
        'l.action',
        'l.entityType',
        'l.entityId',
        'l.before',
        'l.after',
        'l.ip',
        'l.createdAt',
        'a.email as adminEmail',
        'a.fullName as adminName',
      ]);

    if (options.action) query = query.where('l.action', '=', options.action);
    if (options.adminId) query = query.where('l.adminId', '=', options.adminId);

    return query
      .orderBy('l.createdAt', 'desc')
      .limit(options.limit ?? 50)
      .execute();
  }

  // =================================================================
  //  Verifikatsiya navbati
  // =================================================================

  /**
   * Tekshirish kutayotgan hujjatlar, haydovchilar va transportlar.
   *
   * Bu — moderatorning asosiy ish ekrani. Eng eski so'rov birinchi
   * turadi (FIFO): navbatda unutilib qolgan ariza bo'lmasligi kerak.
   */
  async verificationQueue() {
    const [documents, drivers, vehicles] = await Promise.all([
      this.database.db
        .selectFrom('documents as d')
        .leftJoin('users as u', 'u.id', 'd.ownerId')
        .select([
          'd.id',
          'd.type',
          'd.ownerType',
          'd.ownerId',
          'd.fileKey',
          'd.createdAt',
          'u.firstName',
          'u.lastName',
          'u.phone',
        ])
        .where('d.verificationStatus', '=', 'PENDING')
        .orderBy('d.createdAt', 'asc')
        .limit(50)
        .execute(),

      this.database.db
        .selectFrom('driverProfiles as dp')
        .innerJoin('users as u', 'u.id', 'dp.userId')
        .select([
          'dp.userId',
          'dp.licenseCategories',
          'dp.experienceYears',
          'dp.createdAt',
          'u.firstName',
          'u.lastName',
          'u.phone',
        ])
        .where('dp.verificationStatus', '=', 'PENDING')
        .orderBy('dp.createdAt', 'asc')
        .limit(50)
        .execute(),

      this.database.db
        .selectFrom('vehicles as v')
        .innerJoin('users as u', 'u.id', 'v.driverId')
        .select([
          'v.id',
          'v.brand',
          'v.model',
          'v.plateNumber',
          'v.capacityKg',
          'v.createdAt',
          'u.firstName',
          'u.lastName',
          'u.phone',
        ])
        .where('v.verificationStatus', '=', 'PENDING')
        .orderBy('v.createdAt', 'asc')
        .limit(50)
        .execute(),
    ]);

    return {
      documents,
      drivers,
      vehicles,
      total: documents.length + drivers.length + vehicles.length,
    };
  }

  /**
   * Hujjatni koʻrish uchun qisqa muddatli havola.
   *
   * NEGA ALOHIDA ENDPOINT, NAVBAT JAVOBIDA EMAS:
   *
   *   1. Navbatda 50 tagacha hujjat boʻladi. Har biriga imzo yasash —
   *      50 ta ortiqcha hisob va ularning koʻpi hech qachon ochilmaydi.
   *   2. Imzo 5 daqiqada oʻladi. Navbat bilan birga berilsa, operator
   *      20-hujjatga yetganda havolalar allaqachon eskirgan boʻladi.
   *   3. HAR BIR OCHISH AUDITGA YOZILADI. Hujjatda pasport raqami va
   *      PINFL boʻladi; kim qachon kimning hujjatini ochgani
   *      kuzatilishi shart (`docs/08-admin.md`, 8.4.5). Navbat javobida
   *      berilsa, "koʻrdi" degan fakt yoʻqoladi — roʻyxatni ochish
   *      50 ta hujjatni koʻrish bilan bir xil boʻlib qolardi.
   *
   * Huquq `docs.verify` — hujjatni tekshirishi kerak odam uni koʻrishi
   * ham kerak. Alohida "shaxsiy maʼlumotni ochish" huquqi rollar
   * seedini oʻzgartirishni talab qiladi va u alohida qadamga qoldirildi;
   * audit talabi esa shu yerda bajarilgan.
   */
  async documentViewUrl(
    ctx: AuditContext,
    documentId: string,
  ): Promise<{
    id: string;
    type: string;
    fileName: string | null;
    mimeType: string | null;
    pageSide: string | null;
    url: string;
  }> {
    const document = await this.database.db
      .selectFrom('documents')
      .select(['id', 'ownerId', 'type', 'fileKey', 'fileName', 'mimeType', 'pageSide'])
      .where('id', '=', documentId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!document) throw AppError.notFound('Hujjat topilmadi');

    // Audit HAVOLA BERILISHIDAN OLDIN yoziladi: agar yozuv yiqilsa,
    // havola ham berilmaydi. Teskarisi boʻlsa, kuzatilmagan koʻrish
    // sodir boʻlishi mumkin edi.
    await this.audit(
      ctx,
      'document.view',
      { type: 'DOCUMENT', id: documentId },
      undefined,
      { type: document.type },
      document.ownerId,
    );

    return {
      id: document.id,
      type: document.type,
      fileName: document.fileName,
      mimeType: document.mimeType,
      pageSide: document.pageSide,
      url: await this.storage.createDownloadUrl(document.fileKey),
    };
  }

  async verifyDocument(
    ctx: AuditContext,
    documentId: string,
    approve: boolean,
    reason?: string,
  ): Promise<void> {
    const before = await this.database.db
      .selectFrom('documents')
      .select(['id', 'ownerId', 'verificationStatus', 'type'])
      .where('id', '=', documentId)
      .executeTakeFirst();

    if (!before) throw AppError.notFound('Hujjat topilmadi');

    const status = approve ? 'VERIFIED' : 'REJECTED';

    await this.database.db
      .updateTable('documents')
      .set({
        verificationStatus: status,
        verifiedAt: approve ? new Date() : null,
        verifiedBy: ctx.adminId,
        rejectionReason: approve ? null : (reason ?? 'Sabab koʻrsatilmagan'),
      })
      .where('id', '=', documentId)
      .execute();

    await this.audit(
      ctx,
      approve ? 'document.verify' : 'document.reject',
      { type: 'DOCUMENT', id: documentId },
      { status: before.verificationStatus },
      { status, reason },
      before.ownerId,
    );

    await this.notifications.notify({
      userId: before.ownerId,
      type: 'document.reviewed',
      title: approve ? 'Hujjat tasdiqlandi' : 'Hujjat rad etildi',
      body: approve
        ? `${before.type} tekshiruvdan oʻtdi`
        : `${before.type} rad etildi: ${reason ?? 'sabab koʻrsatilmagan'}`,
      entityType: 'DOCUMENT',
      entityId: documentId,
      deepLink: 'karvon://profile/documents',
      dedupeKey: `doc-review:${documentId}:${status}`,
    });
  }

  async verifyDriver(
    ctx: AuditContext,
    driverId: string,
    approve: boolean,
    reason?: string,
  ): Promise<void> {
    const before = await this.database.db
      .selectFrom('driverProfiles')
      .select(['userId', 'verificationStatus'])
      .where('userId', '=', driverId)
      .executeTakeFirst();

    if (!before) throw AppError.notFound('Haydovchi topilmadi');

    const status = approve ? 'VERIFIED' : 'REJECTED';

    await this.database.db
      .updateTable('driverProfiles')
      .set({
        verificationStatus: status,
        verifiedAt: approve ? new Date() : null,
        verifiedBy: ctx.adminId,
        rejectionReason: approve ? null : (reason ?? null),
      })
      .where('userId', '=', driverId)
      .execute();

    await this.audit(
      ctx,
      approve ? 'driver.verify' : 'driver.reject',
      { type: 'DRIVER', id: driverId },
      { status: before.verificationStatus },
      { status, reason },
      driverId,
    );

    await this.notifications.notify({
      userId: driverId,
      type: 'document.reviewed',
      title: approve ? 'Verifikatsiya yakunlandi' : 'Verifikatsiya rad etildi',
      body: approve
        ? 'Endi yuklarga taklif yuborishingiz mumkin'
        : `Sabab: ${reason ?? 'koʻrsatilmagan'}`,
      entityType: 'USER',
      entityId: driverId,
      deepLink: 'karvon://profile/verification',
      dedupeKey: `driver-review:${driverId}:${status}`,
    });
  }

  async verifyVehicle(
    ctx: AuditContext,
    vehicleId: string,
    approve: boolean,
    reason?: string,
  ): Promise<void> {
    const before = await this.database.db
      .selectFrom('vehicles')
      .select(['id', 'driverId', 'verificationStatus', 'plateNumber'])
      .where('id', '=', vehicleId)
      .executeTakeFirst();

    if (!before) throw AppError.notFound('Transport topilmadi');

    const status = approve ? 'VERIFIED' : 'REJECTED';

    await this.database.db
      .updateTable('vehicles')
      //  jadvalida / ustunlari
      // yoʻq — sabab audit jurnalida saqlanadi (quyida)
      .set({ verificationStatus: status })
      .where('id', '=', vehicleId)
      .execute();

    await this.audit(
      ctx,
      approve ? 'vehicle.verify' : 'vehicle.reject',
      { type: 'VEHICLE', id: vehicleId },
      { status: before.verificationStatus },
      { status, reason },
      before.driverId,
    );

    await this.notifications.notify({
      userId: before.driverId,
      type: 'document.reviewed',
      title: approve ? 'Transport tasdiqlandi' : 'Transport rad etildi',
      body: `${before.plateNumber}${approve ? '' : ` — ${reason ?? 'sabab koʻrsatilmagan'}`}`,
      entityType: 'VEHICLE',
      entityId: vehicleId,
      deepLink: 'karvon://profile/vehicles',
      dedupeKey: `vehicle-review:${vehicleId}:${status}`,
    });
  }

  // =================================================================
  //  Foydalanuvchilar
  // =================================================================

  async listUsers(options: {
    search?: string;
    role?: string;
    status?: string;
    limit?: number;
  }) {
    let query = this.database.db
      .selectFrom('users')
      .select([
        'id',
        'phone',
        'firstName',
        'lastName',
        'role',
        'status',
        'ratingAvg',
        'ratingCount',
        'completedOrders',
        'cancelledOrders',
        'createdAt',
        'lastSeenAt',
      ])
      .where('deletedAt', 'is', null);

    if (options.search) {
      const term = `%${options.search.trim()}%`;
      query = query.where((eb) =>
        eb.or([
          eb('phone', 'like', term),
          eb('firstName', 'ilike', term),
          eb('lastName', 'ilike', term),
        ]),
      );
    }
    if (options.role) query = query.where('role', '=', options.role as 'SHIPPER');
    if (options.status) query = query.where('status', '=', options.status as 'ACTIVE');

    return query
      .orderBy('createdAt', 'desc')
      .limit(options.limit ?? 50)
      .execute();
  }

  /**
   * Foydalanuvchini bloklash.
   *
   * `token_version` oshiriladi — bu barcha faol sessiyalarni BIR ZUMDA
   * bekor qiladi. Aks holda bloklangan foydalanuvchi tokeni muddati
   * tugagunicha ishlab turardi.
   */
  async setUserStatus(
    ctx: AuditContext,
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'BANNED',
    reason?: string,
  ): Promise<void> {
    const before = await this.database.db
      .selectFrom('users')
      .select(['id', 'status', 'tokenVersion', 'phone'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!before) throw AppError.notFound('Foydalanuvchi topilmadi');

    await this.database.db
      .updateTable('users')
      .set((eb) => ({
        status,
        // Bloklashda barcha sessiyalar darhol bekor qilinadi
        tokenVersion: status === 'ACTIVE' ? eb.ref('tokenVersion') : eb('tokenVersion', '+', 1),
      }))
      .where('id', '=', userId)
      .execute();

    if (status !== 'ACTIVE') {
      await this.database.db
        .updateTable('userSessions')
        .set({ revokedAt: new Date() })
        .where('userId', '=', userId)
        .where('revokedAt', 'is', null)
        .execute();
    }

    await this.audit(
      ctx,
      `user.${status.toLowerCase()}`,
      { type: 'USER', id: userId },
      { status: before.status },
      { status, reason },
      userId,
    );

    this.logger.warn({ userId, status, adminId: ctx.adminId, reason }, 'Foydalanuvchi holati oʻzgardi');
  }

  async userDetail(userId: string) {
    const user = await this.database.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) throw AppError.notFound('Foydalanuvchi topilmadi');

    const [wallet, orders, documents] = await Promise.all([
      this.ledger.balance(userId),
      this.database.db
        .selectFrom('orders')
        .select((eb) => [eb.fn.countAll<string>().as('count')])
        .where((eb) => eb.or([eb('shipperId', '=', userId), eb('driverId', '=', userId)]))
        .executeTakeFirst(),
      this.database.db
        .selectFrom('documents')
        .select(['id', 'type', 'verificationStatus', 'createdAt'])
        .where('ownerId', '=', userId)
        .execute(),
    ]);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        ratingAvg: user.ratingAvg,
        ratingCount: user.ratingCount,
        completedOrders: user.completedOrders,
        cancelledOrders: user.cancelledOrders,
        createdAt: user.createdAt,
      },
      wallet: { ...wallet, formatted: formatSoum(wallet.balanceTiyin) },
      ordersCount: Number(orders?.count ?? 0),
      documents,
    };
  }

  // =================================================================
  //  Moliya
  // =================================================================

  async pendingPayouts() {
    return this.database.db
      .selectFrom('payouts as p')
      .innerJoin('users as u', 'u.id', 'p.driverId')
      .select([
        'p.id',
        'p.amountTiyin',
        'p.cardMask',
        'p.status',
        'p.requestedAt',
        'u.id as driverId',
        'u.firstName',
        'u.lastName',
        'u.phone',
      ])
      .where('p.status', 'in', ['CREATED', 'PENDING'])
      .orderBy('p.requestedAt', 'asc')
      .execute();
  }

  async completePayout(ctx: AuditContext, payoutId: string, providerTxnId: string): Promise<void> {
    await this.payouts.complete(payoutId, providerTxnId);
    await this.audit(
      ctx,
      'payout.complete',
      { type: 'PAYOUT', id: payoutId },
      undefined,
      { providerTxnId },
    );
  }

  async rejectPayout(ctx: AuditContext, payoutId: string, reason: string): Promise<void> {
    await this.payouts.reject(payoutId, reason);
    await this.audit(ctx, 'payout.reject', { type: 'PAYOUT', id: payoutId }, undefined, { reason });
  }

  /**
   * Ledger butunligini tekshiradi.
   *
   * Kunlik cron ham shu metodni chaqiradi. Natija bo'sh bo'lmasa —
   * bu darhol tekshirilishi kerak bo'lgan jiddiy holat.
   */
  async ledgerIntegrity() {
    return this.ledger.verifyIntegrity();
  }

  // =================================================================
  //  Sozlamalar
  // =================================================================

  async listSettings() {
    return this.database.db
      .selectFrom('platformSettings')
      .select(['key', 'value', 'description', 'updatedAt'])
      .orderBy('key', 'asc')
      .execute();
  }

  /**
   * Sozlamani o'zgartiradi.
   *
   * Komissiya foizi, matching og'irliklari, jarima — hammasi shu yerdan
   * boshqariladi va kodni qayta yig'ish shart emas. Har o'zgarish
   * auditga yoziladi: "komissiya kim tomonidan 5% dan 12% ga
   * ko'tarildi" savoliga javob bo'lishi kerak.
   */
  async updateSetting(ctx: AuditContext, key: string, value: unknown): Promise<void> {
    const before = await this.database.db
      .selectFrom('platformSettings')
      .select(['key', 'value'])
      .where('key', '=', key)
      .executeTakeFirst();

    if (!before) throw AppError.notFound('Sozlama topilmadi');

    await this.database.db
      .updateTable('platformSettings')
      .set({ value: JSON.stringify(value), updatedBy: ctx.adminId, updatedAt: new Date() })
      .where('key', '=', key)
      .execute();

    await this.settings.invalidate(key);

    await this.audit(
      ctx,
      'settings.update',
      { type: 'SETTING', id: null },
      { key, value: before.value },
      { key, value },
    );

    this.logger.warn(
      { key, before: before.value, after: value, adminId: ctx.adminId },
      'Platforma sozlamasi oʻzgartirildi',
    );
  }

  // =================================================================
  //  Statistika
  // =================================================================

  /**
   * Boshqaruv paneli ko'rsatkichlari.
   *
   * Barcha so'rovlar parallel bajariladi: panel bitta so'rov bilan
   * ochiladi va sekin bo'lmasligi kerak.
   */
  async dashboard() {
    const [users, orders, revenue, activeLoads, pendingVerifications] = await Promise.all([
      sql<{ total: string; drivers: string; shippers: string; newToday: string }>`
        SELECT count(*)::text                                                  AS total,
               count(*) FILTER (WHERE role IN ('DRIVER','BOTH'))::text          AS drivers,
               count(*) FILTER (WHERE role IN ('SHIPPER','BOTH'))::text         AS shippers,
               count(*) FILTER (WHERE created_at >= current_date)::text         AS new_today
          FROM users WHERE deleted_at IS NULL AND status = 'ACTIVE'
      `.execute(this.database.db),

      sql<{ total: string; active: string; completed: string; today: string }>`
        SELECT count(*)::text                                                   AS total,
               count(*) FILTER (WHERE status IN ('ASSIGNED','CONFIRMED','EN_ROUTE_TO_PICKUP',
                                                 'ARRIVED_AT_PICKUP','LOADED','IN_TRANSIT',
                                                 'ARRIVED_AT_DELIVERY'))::text  AS active,
               count(*) FILTER (WHERE status IN ('COMPLETED','CLOSED'))::text   AS completed,
               count(*) FILTER (WHERE created_at >= current_date)::text         AS today
          FROM orders
      `.execute(this.database.db),

      sql<{ totalTiyin: string; todayTiyin: string; monthTiyin: string }>`
        SELECT COALESCE(SUM(e.amount_tiyin), 0)::text                             AS total_tiyin,
               COALESCE(SUM(e.amount_tiyin) FILTER (WHERE e.created_at >= current_date), 0)::text
                                                                                AS today_tiyin,
               COALESCE(SUM(e.amount_tiyin) FILTER (WHERE e.created_at >= date_trunc('month', now())), 0)::text
                                                                                AS month_tiyin
          FROM ledger_entries e
          JOIN ledger_accounts a ON a.id = e.account_id
         WHERE a.type = 'PLATFORM_REVENUE' AND e.amount_tiyin > 0
      `.execute(this.database.db),

      this.database.db
        .selectFrom('loads')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('status', 'in', ['PUBLISHED', 'MATCHING', 'OFFERS_RECEIVED'])
        .executeTakeFirst(),

      this.verificationQueue(),
    ]);

    const revenueRow = revenue.rows[0];

    return {
      users: {
        total: Number(users.rows[0].total),
        drivers: Number(users.rows[0].drivers),
        shippers: Number(users.rows[0].shippers),
        newToday: Number(users.rows[0].newToday),
      },
      orders: {
        total: Number(orders.rows[0].total),
        active: Number(orders.rows[0].active),
        completed: Number(orders.rows[0].completed),
        today: Number(orders.rows[0].today),
      },
      revenue: {
        totalTiyin: revenueRow.totalTiyin,
        totalFormatted: formatSoum(toTiyin(revenueRow.totalTiyin)),
        todayTiyin: revenueRow.todayTiyin,
        todayFormatted: formatSoum(toTiyin(revenueRow.todayTiyin)),
        monthTiyin: revenueRow.monthTiyin,
        monthFormatted: formatSoum(toTiyin(revenueRow.monthTiyin)),
      },
      activeLoads: Number(activeLoads?.count ?? 0),
      pendingVerifications: pendingVerifications.total,
    };
  }

  /**
   * Kunlik dinamika — grafiklar uchun.
   *
   * NEGA ALOHIDA ENDPOINT: `dashboard()` bir nechta COUNT qaytaradi va
   * u tez. Bu esa oraliq boʻyicha guruhlangan skanerlash — 90 kunlik
   * soʻrov sekinroq. Ikkisini qoʻshib qoʻysak, KPI kartalar eng sekin
   * soʻrovni kutib turardi.
   *
   * BOʻSH KUNLAR NOL BILAN TOʻLDIRILADI (`generate_series`). Buyurtma
   * boʻlmagan kun grafikdan tushib qolsa, chiziq ikkita qoʻshni kunni
   * toʻgʻridan-toʻgʻri bogʻlaydi va pasayish umuman koʻrinmaydi —
   * grafik yolgʻon gapiradi.
   *
   * VAQT ZONASI ANIQ KOʻRSATILGAN. Bazaning sessiya zonasiga
   * tayanish xavfli: boshqa muhitda u UTC boʻlsa, kun chegarasi
   * Toshkent vaqti bilan 05:00 ga siljiydi va "bugungi buyurtmalar"
   * jimgina notoʻgʻri boʻlib qoladi.
   *
   * GMV va komissiya YAKUNLANGAN sanaga yoziladi, yaratilgan sanaga
   * emas: daromad buyurtma yopilgandagina haqiqiy boʻladi.
   */
  async dashboardSeries(days: number): Promise<
    {
      date: string;
      created: number;
      cancelled: number;
      completed: number;
      gmvTiyin: string;
      commissionTiyin: string;
    }[]
  > {
    const result = await sql<{
      date: string;
      created: string;
      cancelled: string;
      completed: string;
      gmvTiyin: string;
      commissionTiyin: string;
    }>`
      WITH bounds AS (
        SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date            AS today,
               (now() AT TIME ZONE 'Asia/Tashkent')::date - (${days}::int - 1) AS since
      ),
      days AS (
        SELECT generate_series(b.since, b.today, interval '1 day')::date AS day FROM bounds b
      ),
      created AS (
        SELECT (o.created_at AT TIME ZONE 'Asia/Tashkent')::date AS day,
               count(*)                                          AS n
          FROM orders o, bounds b
         WHERE (o.created_at AT TIME ZONE 'Asia/Tashkent')::date >= b.since
         GROUP BY 1
      ),
      -- Bekor qilish cancelled_at SANASIGA yoziladi, yaratilgan sanaga
      -- emas: yakunlanish bilan bir xil mantiq. Status roʻyxati
      -- ishlatilmaydi, chunki bekor qilishning uchta turi bor
      -- (CANCELLED_BY_SHIPPER / DRIVER / ADMIN) va yangisi qoʻshilsa
      -- bu soʻrov jimgina notoʻgʻri boʻlib qolardi.
      cancelled AS (
        SELECT (o.cancelled_at AT TIME ZONE 'Asia/Tashkent')::date AS day,
               count(*)                                            AS n
          FROM orders o, bounds b
         WHERE o.cancelled_at IS NOT NULL
           AND (o.cancelled_at AT TIME ZONE 'Asia/Tashkent')::date >= b.since
         GROUP BY 1
      ),
      finished AS (
        SELECT (o.completed_at AT TIME ZONE 'Asia/Tashkent')::date AS day,
               count(*)                                            AS n,
               COALESCE(SUM(o.price_tiyin), 0)                      AS gmv,
               COALESCE(SUM(o.commission_tiyin), 0)                 AS commission
          FROM orders o, bounds b
         WHERE o.completed_at IS NOT NULL
           AND (o.completed_at AT TIME ZONE 'Asia/Tashkent')::date >= b.since
         GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD')      AS date,
             COALESCE(c.n, 0)::text            AS created,
             COALESCE(x.n, 0)::text            AS cancelled,
             COALESCE(f.n, 0)::text            AS completed,
             COALESCE(f.gmv, 0)::text          AS gmv_tiyin,
             COALESCE(f.commission, 0)::text   AS commission_tiyin
        FROM days d
        LEFT JOIN created   c ON c.day = d.day
        LEFT JOIN cancelled x ON x.day = d.day
        LEFT JOIN finished  f ON f.day = d.day
       ORDER BY d.day
    `.execute(this.database.db);

    return result.rows.map((row) => ({
      date: row.date,
      created: Number(row.created),
      cancelled: Number(row.cancelled),
      completed: Number(row.completed),
      // Pul BUTUN SON EMAS, SATR: tiyin qiymati `Number.MAX_SAFE_INTEGER`
      // dan oshishi mumkin va mijoz uni oʻzi formatlaydi
      gmvTiyin: row.gmvTiyin,
      commissionTiyin: row.commissionTiyin,
    }));
  }

  // =================================================================
  //  Buyurtmalar (support)
  // =================================================================

  /**
   * Telefon raqamini yashiradi: `+998901112233` → `+9989011****3`.
   *
   * NEGA ADMIN PANELIDA HAM YASHIRILADI: platformaning butun biznes
   * modeli kontaktni yukni olishgacha yashirishga qurilgan
   * (`docs/03-user-flows.md`). Admin uchun ham ochiq qoldirilsa,
   * roʻyxatni ochgan har bir xodim yuzlab raqamni bir zumda koʻradi
   * va ularni chiqarib yuborish uchun hech qanday iz qolmaydi.
   *
   * Haqiqiy raqam alohida endpointdan olinadi va HAR BIR OCHISH
   * auditga yoziladi.
   */
  private maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    if (phone.length <= 5) return phone;
    return `${phone.slice(0, -5)}****${phone.slice(-1)}`;
  }

  /**
   * Buyurtmalar roʻyxati — support uchun.
   *
   * `orders.service.ts` dagi `selectOrders` QAYTA ISHLATILMAYDI: u
   * koʻruvchiga bogʻlangan (`toView(row, viewerId)`) va kontakt
   * koʻrinishi qoidalarini oʻsha koʻruvchi uchun hisoblaydi. Admin
   * esa tomon emas — unga boshqa qoida amal qiladi va ikkalasini
   * bitta funksiyaga tiqish ikkalasini ham chalkashtirardi.
   */
  async listOrders(options: { status?: string; search?: string; limit?: number }) {
    let query = this.database.db
      .selectFrom('orders as o')
      .innerJoin('loads as l', 'l.id', 'o.loadId')
      .innerJoin('users as s', 's.id', 'o.shipperId')
      .innerJoin('users as d', 'd.id', 'o.driverId')
      .select([
        'o.id',
        'o.publicNo',
        'o.status',
        'o.priceTiyin',
        'o.commissionTiyin',
        'o.paymentStatus',
        'o.createdAt',
        'o.deliveredAt',
        'o.cancelledAt',
        'l.title as loadTitle',
        'l.pickupAddress',
        'l.deliveryAddress',
        's.id as shipperId',
        's.firstName as shipperFirstName',
        's.lastName as shipperLastName',
        's.phone as shipperPhone',
        'd.id as driverId',
        'd.firstName as driverFirstName',
        'd.lastName as driverLastName',
        'd.phone as driverPhone',
      ]);

    if (options.status) {
      query = query.where('o.status', '=', options.status as OrderStatusDb);
    }

    if (options.search) {
      const term = `%${options.search.trim()}%`;
      query = query.where((eb) =>
        eb.or([
          // `public_no` — BIGINT, matn emas. `ILIKE` uni toʻgʻridan-
          // toʻgʻri qabul qilmaydi va soʻrov 500 bilan yiqiladi;
          // shuning uchun aniq `::text` kerak
          eb(sql<string>`o.public_no::text`, 'like', term),
          eb('s.phone', 'like', term),
          eb('d.phone', 'like', term),
        ]),
      );
    }

    const rows = await query
      .orderBy('o.createdAt', 'desc')
      .limit(options.limit ?? 50)
      .execute();

    return rows.map((row) => ({
      ...row,
      shipperPhone: this.maskPhone(row.shipperPhone),
      driverPhone: this.maskPhone(row.driverPhone),
    }));
  }

  /**
   * Bitta buyurtmaning toʻliq manzarasi.
   *
   * Status tarixi ham shu yerda: support "nima boʻlgan?" degan savolga
   * javob berishi kerak va u vaqt chizigʻisiz mumkin emas.
   */
  async orderDetail(orderId: string) {
    const order = await this.database.db
      .selectFrom('orders as o')
      .innerJoin('loads as l', 'l.id', 'o.loadId')
      .innerJoin('users as s', 's.id', 'o.shipperId')
      .innerJoin('users as d', 'd.id', 'o.driverId')
      .leftJoin('vehicles as v', 'v.id', 'o.vehicleId')
      .leftJoin('conversations as c', 'c.orderId', 'o.id')
      .select([
        'o.id',
        'o.publicNo',
        'o.status',
        'o.priceTiyin',
        'o.commissionTiyin',
        'o.driverPayoutTiyin',
        'o.penaltyTiyin',
        'o.paymentMethod',
        'o.paymentStatus',
        'o.plannedDistanceKm',
        'o.actualDistanceKm',
        'o.cancelReason',
        'o.createdAt',
        'o.confirmedAt',
        'o.pickedUpAt',
        'o.deliveredAt',
        'o.completedAt',
        'o.cancelledAt',
        'l.title as loadTitle',
        'l.weightKg as loadWeightKg',
        'l.pickupAddress',
        'l.deliveryAddress',
        'l.distanceKm',
        's.id as shipperId',
        's.firstName as shipperFirstName',
        's.lastName as shipperLastName',
        's.phone as shipperPhone',
        'd.id as driverId',
        'd.firstName as driverFirstName',
        'd.lastName as driverLastName',
        'd.phone as driverPhone',
        'v.brand as vehicleBrand',
        'v.model as vehicleModel',
        'v.plateNumber as vehiclePlate',
        'c.id as conversationId',
      ])
      .where('o.id', '=', orderId)
      .executeTakeFirst();

    if (!order) throw AppError.notFound('Buyurtma topilmadi');

    const history = await this.database.db
      .selectFrom('orderStatusHistory as h')
      .leftJoin('users as u', 'u.id', 'h.actorId')
      .select([
        'h.id',
        'h.fromStatus',
        'h.toStatus',
        'h.actorRole',
        'h.note',
        'h.createdAt',
        'u.firstName as actorFirstName',
        'u.lastName as actorLastName',
      ])
      .where('h.orderId', '=', orderId)
      .orderBy('h.createdAt', 'asc')
      .execute();

    return {
      order: {
        ...order,
        shipperPhone: this.maskPhone(order.shipperPhone),
        driverPhone: this.maskPhone(order.driverPhone),
      },
      history,
      // Moliya bir joyda: support "pul qayerda?" degan savolga javob
      // berishi kerak
      finance: {
        priceFormatted: formatSoum(toTiyin(order.priceTiyin)),
        commissionFormatted: formatSoum(toTiyin(order.commissionTiyin)),
        driverPayoutFormatted: formatSoum(toTiyin(order.driverPayoutTiyin)),
        penaltyFormatted: formatSoum(toTiyin(order.penaltyTiyin)),
      },
    };
  }

  /**
   * Haqiqiy telefon raqamlari.
   *
   * ALOHIDA ENDPOINT VA AUDITGA YOZILADI. Roʻyxatda raqamlar
   * yashirilgan; ularni ochish — ONGLI amal va u kuzatiladi. Aks
   * holda buyurtmalar roʻyxatini ochgan xodim bir zumda yuzlab
   * raqamni koʻrardi va ularning tashqariga chiqishi hech qanday iz
   * qoldirmasdi.
   */
  async orderContacts(ctx: AuditContext, orderId: string) {
    const order = await this.database.db
      .selectFrom('orders as o')
      .innerJoin('users as s', 's.id', 'o.shipperId')
      .innerJoin('users as d', 'd.id', 'o.driverId')
      .select([
        'o.id',
        'o.publicNo',
        's.id as shipperId',
        's.phone as shipperPhone',
        'd.id as driverId',
        'd.phone as driverPhone',
      ])
      .where('o.id', '=', orderId)
      .executeTakeFirst();

    if (!order) throw AppError.notFound('Buyurtma topilmadi');

    // Audit MAʼLUMOT BERILISHIDAN OLDIN: yozuv yiqilsa, raqamlar ham
    // berilmaydi
    await this.audit(ctx, 'order.contacts_view', { type: 'ORDER', id: orderId }, undefined, {
      publicNo: order.publicNo,
    });

    return {
      shipperPhone: order.shipperPhone,
      driverPhone: order.driverPhone,
    };
  }

  /**
   * Buyurtma chat tarixi.
   *
   * Nizolarda asosiy dalil: kim nima deb va'da qilgan. Alohida huquq
   * (`chat.view`) — moliyachi yoki moderatorga begonalarning
   * yozishmasini oʻqish kerak emas.
   */
  async orderChat(ctx: AuditContext, orderId: string) {
    const conversation = await this.database.db
      .selectFrom('conversations')
      .select(['id'])
      .where('orderId', '=', orderId)
      .executeTakeFirst();

    if (!conversation) return { messages: [] };

    const messages = await this.database.db
      .selectFrom('messages as m')
      .leftJoin('users as u', 'u.id', 'm.senderId')
      .select([
        'm.id',
        'm.type',
        'm.body',
        'm.senderId',
        'm.createdAt',
        'm.readAt',
        'u.firstName as senderFirstName',
        'u.lastName as senderLastName',
      ])
      .where('m.conversationId', '=', conversation.id)
      .where('m.deletedAt', 'is', null)
      .orderBy('m.createdAt', 'asc')
      .limit(500)
      .execute();

    // Yozishmani oʻqish ham kuzatiladi: bu shaxsiy muloqot
    await this.audit(ctx, 'order.chat_view', { type: 'ORDER', id: orderId }, undefined, {
      messages: messages.length,
    });

    return { messages };
  }

  // =================================================================
  //  Shikoyatlar
  // =================================================================

  async listComplaints(status?: string) {
    let query = this.database.db
      .selectFrom('complaints as c')
      .innerJoin('users as r', 'r.id', 'c.reporterId')
      .select([
        'c.id',
        'c.category',
        'c.subject',
        'c.description',
        'c.status',
        'c.priority',
        'c.orderId',
        'c.createdAt',
        'r.firstName as reporterFirstName',
        'r.lastName as reporterLastName',
        'r.phone as reporterPhone',
      ]);

    if (status) query = query.where('c.status', '=', status as 'OPEN');

    return query.orderBy('c.priority', 'asc').orderBy('c.createdAt', 'asc').limit(50).execute();
  }

  async resolveComplaint(
    ctx: AuditContext,
    complaintId: string,
    status: 'RESOLVED' | 'REJECTED' | 'IN_REVIEW' | 'ESCALATED',
    resolution?: string,
  ): Promise<void> {
    const before = await this.database.db
      .selectFrom('complaints')
      .select(['id', 'status', 'reporterId'])
      .where('id', '=', complaintId)
      .executeTakeFirst();

    if (!before) throw AppError.notFound('Shikoyat topilmadi');

    await this.database.db
      .updateTable('complaints')
      .set({
        status,
        resolution: resolution ?? null,
        assignedTo: ctx.adminId,
        resolvedAt: status === 'RESOLVED' || status === 'REJECTED' ? new Date() : null,
      })
      .where('id', '=', complaintId)
      .execute();

    await this.audit(
      ctx,
      'complaint.update',
      { type: 'COMPLAINT', id: complaintId },
      { status: before.status },
      { status, resolution },
      before.reporterId,
    );
  }
}

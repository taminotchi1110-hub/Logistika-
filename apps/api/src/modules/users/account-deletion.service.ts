import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { DatabaseService } from '@/infra/database/database.service';
import type { OwnerType, PaymentStatus } from '@/infra/database/database.types';
import { StorageService } from '@/infra/storage/storage.service';
import { OPEN_STATUSES } from '@/modules/orders/order-status';

/** Hali yakunlanmagan pul yechish so'rovlari. */
const PENDING_PAYOUT_STATUSES: PaymentStatus[] = ['CREATED', 'PENDING', 'HELD'];

/**
 * Hisobni o'chirish — App Store (5.1.1(v)) va Google Play talabi: hisob
 * ochish mumkin bo'lgan ilovada uni ilovaning o'zidan o'chirish ham
 * mumkin bo'lishi shart.
 *
 * NIMA O'CHADI: ism, telefon, avatar, pasport/JShShIR va guvohnoma
 * maydonlari, hujjat fayllari, manzillar, yo'nalishlar, bildirishnomalar,
 * push qurilmalari, sessiyalar, GPS nuqtalari, e'lonlardagi kontaktlar.
 * E'lonlar bekor qilinadi, kutilayotgan takliflar qaytarib olinadi.
 *
 * NIMA QOLADI (shaxssiz): to'lov, ledger va pul yechish yozuvlari —
 * buxgalteriya va soliq talabi; yopilgan buyurtmalar, reytinglar va chat —
 * ular ikkinchi tomonning ham tarixi. Shuning uchun qator o'chirilmaydi,
 * anonimlanadi.
 *
 * QACHON RAD ETILADI: ochiq buyurtma (ikkinchi tomon unga bog'liq),
 * hamyonda qoldiq (qarz ham, yechilmagan pul ham) yoki kutilayotgan pul
 * yechish. Foydalanuvchiga nima qilish kerakligi aytiladi.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async deleteAccount(userId: string): Promise<void> {
    const fileKeys = await this.database.db.transaction().execute(async (trx) => {
      // Qator qulflanadi: tekshiruv va o'chirish orasida parallel so'rov
      // shu foydalanuvchining holatini o'zgartira olmaydi
      const user = await trx
        .selectFrom('users')
        .select(['id', 'phone', 'avatarKey'])
        .where('id', '=', userId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!user) {
        throw AppError.notFound('Foydalanuvchi topilmadi', ErrorCode.USER_NOT_FOUND);
      }

      const openOrder = await trx
        .selectFrom('orders')
        .select('id')
        .where((eb) => eb.or([eb('shipperId', '=', userId), eb('driverId', '=', userId)]))
        .where('status', 'in', [...OPEN_STATUSES])
        .executeTakeFirst();
      if (openOrder) {
        throw AppError.conflict(
          ErrorCode.ACCOUNT_HAS_OPEN_ORDERS,
          'Yakunlanmagan buyurtma bor — avval uni yakunlang yoki bekor qiling',
        );
      }

      const wallet = await trx
        .selectFrom('ledgerAccounts')
        .select('balanceTiyin')
        .where('userId', '=', userId)
        .where('type', '=', 'USER_WALLET')
        .executeTakeFirst();
      if (wallet && BigInt(wallet.balanceTiyin) !== 0n) {
        throw AppError.conflict(
          ErrorCode.ACCOUNT_HAS_BALANCE,
          'Hamyonda qoldiq bor — avval pulni yeching yoki qarzni yoping',
          { balanceTiyin: wallet.balanceTiyin },
        );
      }

      const payout = await trx
        .selectFrom('payouts')
        .select('id')
        .where('driverId', '=', userId)
        .where('status', 'in', PENDING_PAYOUT_STATUSES)
        .executeTakeFirst();
      if (payout) {
        throw AppError.conflict(
          ErrorCode.ACCOUNT_HAS_PENDING_PAYOUT,
          'Pul yechish soʻrovi koʻrib chiqilmoqda — u yakunlangach oʻchiring',
        );
      }

      const now = new Date();

      // Buyurtmaga aylanmagan e'lonlar bekor qilinadi. Kontaktlar (uchinchi
      // shaxslarning ismi va raqami) BARCHA e'lonlarda tozalanadi
      await trx
        .updateTable('loads')
        .set({ status: 'CANCELLED' })
        .where('shipperId', '=', userId)
        .where('status', 'in', ['DRAFT', 'PUBLISHED', 'MATCHING', 'OFFERS_RECEIVED'])
        .execute();
      await trx
        .updateTable('loads')
        .set({
          pickupContactName: null,
          pickupContactPhone: null,
          deliveryContactName: null,
          deliveryContactPhone: null,
        })
        .where('shipperId', '=', userId)
        .execute();

      await trx
        .updateTable('orderOffers')
        .set({ status: 'WITHDRAWN', respondedAt: now })
        .where('driverId', '=', userId)
        .where('status', '=', 'PENDING')
        .execute();

      await trx
        .updateTable('userSessions')
        .set({ revokedAt: now })
        .where('userId', '=', userId)
        .where('revokedAt', 'is', null)
        .execute();
      await trx.deleteFrom('devices').where('userId', '=', userId).execute();
      await trx.deleteFrom('savedAddresses').where('userId', '=', userId).execute();
      await trx.deleteFrom('driverRoutes').where('driverId', '=', userId).execute();
      await trx.deleteFrom('notifications').where('userId', '=', userId).execute();

      // Haydovchi matchingdan chiqadi. Xom GPS nuqtalari o'chadi —
      // buyurtmalarning umumlashgan marshruti (`order_tracks`) qoladi
      await trx
        .updateTable('driverProfiles')
        .set({
          availability: 'OFFLINE',
          licenseNumberEnc: null,
          currentGeom: null,
          currentGeomAt: null,
        })
        .where('userId', '=', userId)
        .execute();
      await trx.deleteFrom('driverLocations').where('driverId', '=', userId).execute();

      // Hujjatlar — allaqachon yumshoq o'chirilganlari ham: ular nizo uchun
      // saqlanib turardi, hisob o'chsa esa saqlashga asos qolmaydi
      const vehicleIds = trx.selectFrom('vehicles').select('id').where('driverId', '=', userId);
      const documents = await trx
        .updateTable('documents')
        .set({ deletedAt: sql<Date>`coalesce(deleted_at, now())` })
        .where((eb) =>
          eb.or([
            eb.and([
              eb('ownerType', 'in', ['USER', 'DRIVER'] as OwnerType[]),
              eb('ownerId', '=', userId),
            ]),
            eb.and([eb('ownerType', '=', 'VEHICLE'), eb('ownerId', 'in', vehicleIds)]),
          ]),
        )
        .returning('fileKey')
        .execute();

      // Transport ro'yxatdan chiqadi — davlat raqami boshqa egaga bo'shaydi
      // (`uq_vehicles_plate` faqat o'chirilmaganlar orasida)
      await trx
        .updateTable('vehicles')
        .set({ deletedAt: now, isActive: false, isPrimary: false })
        .where('driverId', '=', userId)
        .where('deletedAt', 'is', null)
        .execute();

      await trx
        .updateTable('loginHistory')
        .set({ phone: null })
        .where('userId', '=', userId)
        .execute();
      await trx.deleteFrom('otpRequests').where('phone', '=', user.phone).execute();
      await sql`DELETE FROM favorites WHERE user_id = ${userId} OR target_id = ${userId}`.execute(
        trx,
      );
      await sql`DELETE FROM blacklists WHERE user_id = ${userId} OR target_id = ${userId}`.execute(
        trx,
      );

      // Telefon "hech qachon mavjud bo'lmagan" raqamga almashadi (0005
      // migratsiyasi): haqiqiy raqam bo'shaydi va u bilan qaytadan
      // ro'yxatdan o'tish mumkin. `token_version` — hali muddati tugamagan
      // access tokenlar ham darhol kuchsizlanadi
      await trx
        .updateTable('users')
        .set({
          phone: sql<string>`'+99800' || lpad(nextval('deleted_user_phone_seq')::text, 7, '0')`,
          phoneVerifiedAt: null,
          status: 'DELETED',
          firstName: null,
          lastName: null,
          middleName: null,
          birthDate: null,
          avatarKey: null,
          email: null,
          passportNumberEnc: null,
          pinflEnc: null,
          referralCode: null,
          lastSeenAt: null,
          tokenVersion: sql<number>`token_version + 1`,
          deletedAt: now,
        })
        .where('id', '=', userId)
        .execute();

      return [...documents.map((row) => row.fileKey), ...(user.avatarKey ? [user.avatarKey] : [])];
    });

    // Fayllar tranzaksiyadan KEYIN: S3 tranzaksiyaga kirmaydi — fayl o'chib,
    // tranzaksiya esa bekor bo'lsa, yozuv yo'q faylga ishora qilib qolardi.
    // Birortasi o'chmasa ham hisob o'chirilgan hisoblanadi, qolgani logda
    const results = await Promise.allSettled(fileKeys.map((key) => this.storage.delete(key)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(
        { userId, failed, total: fileKeys.length },
        'Hisob oʻchirildi, lekin baʼzi fayllar S3 da qoldi',
      );
    }
    this.logger.log({ userId, files: fileKeys.length }, 'Hisob oʻchirildi');
  }
}

/* eslint-disable no-console */
/**
 * Admin akkaunt yaratish.
 *
 *   npm run admin:create -- --email=admin@karvon.uz --password='...' \
 *                           --name='Bosh administrator' --role=SUPER_ADMIN
 *
 * NEGA ENDPOINT EMAS, SKRIPT: "birinchi adminni yaratish" endpointi
 * ochiq bo'lishi kerak edi va u eng katta xavf nuqtasiga aylanardi
 * (kim birinchi bo'lsa — o'sha super admin). Skript esa faqat serverga
 * kirish huquqi bor odam ishlata oladi.
 *
 * TOTP kaliti chiqariladi va Authenticator ilovasiga kiritiladi.
 * U BIR MARTA ko'rsatiladi — bazada saqlanadi, lekin qayta ko'rsatilmaydi.
 */
import { config as loadEnv } from 'dotenv';
import { Kysely, PostgresDialect, CamelCasePlugin } from 'kysely';
import { Pool } from 'pg';
import { resolve } from 'node:path';

import { AdminAuthService } from '@/modules/admin/admin-auth.service';
import type { Database } from '@/infra/database/database.types';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: '.env' });

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const email = arg('email');
  const password = arg('password');
  const fullName = arg('name') ?? 'Administrator';
  const roleCode = arg('role') ?? 'SUPER_ADMIN';

  if (!email || !password) {
    console.error('Ishlatish: npm run admin:create -- --email=... --password=... [--name=...] [--role=...]');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('Parol kamida 12 belgidan iborat boʻlishi kerak');
    process.exit(1);
  }

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    plugins: [new CamelCasePlugin()],
  });

  const role = await db
    .selectFrom('adminRoles')
    .select(['id', 'code'])
    .where('code', '=', roleCode)
    .executeTakeFirst();

  if (!role) {
    console.error(`"${roleCode}" roli topilmadi. Avval db:seed ishga tushiring.`);
    await db.destroy();
    process.exit(1);
  }

  const passwordHash = await AdminAuthService.hashPassword(password);
  const totpSecret = AdminAuthService.generateTotpSecret();

  const created = await db
    .insertInto('adminUsers')
    .values({
      email: email.toLowerCase().trim(),
      passwordHash,
      fullName,
      roleId: role.id,
      totpSecretEnc: Buffer.from(totpSecret, 'utf8'),
      isActive: true,
    })
    .onConflict((oc) => oc.column('email').doNothing())
    .returning(['id', 'email'])
    .executeTakeFirst();

  if (!created) {
    console.error(`"${email}" allaqachon mavjud`);
    await db.destroy();
    process.exit(1);
  }

  console.log('\nAdmin yaratildi\n');
  console.log(`  Email:  ${created.email}`);
  console.log(`  Rol:    ${role.code}`);
  console.log(`  ID:     ${created.id}`);
  console.log('\n  TOTP kaliti (Authenticator ilovasiga kiriting):');
  console.log(`  ${totpSecret}`);
  console.log('\n  QR uchun havola:');
  console.log(`  ${AdminAuthService.totpUri(created.email, totpSecret)}`);
  console.log('\n  Bu kalit QAYTA KOʻRSATILMAYDI. Hozir saqlab qoʻying.\n');

  await db.destroy();
}

main().catch((error: unknown) => {
  console.error('Xato:', error instanceof Error ? error.message : error);
  process.exit(1);
});

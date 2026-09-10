/* eslint-disable no-console */
/**
 * KARVON — admin paneli
 *
 * Tekshiriladi:
 *   - parol + MAJBURIY TOTP; noto'g'ri urinishlarda bloklash
 *   - foydalanuvchi tokeni admin endpointlarida ISHLAMAYDI (va aksincha)
 *   - huquqlar: moderator moliyaviy amallarga kira olmaydi
 *   - verifikatsiya navbati va tasdiqlash
 *   - foydalanuvchini bloklash → sessiyalar DARHOL bekor bo'ladi
 *   - sozlamani o'zgartirish darhol kuchga kiradi
 *   - har bir amal audit jurnaliga yoziladi
 *
 * Ishlatish: node scripts/admin-test.js
 */
const { authenticator } = require('otplib');
const { Client } = require('pg');

const { API, api, login, createOrderFixture, randomPlate } = require('./lib/fixtures');

const PGURL =
  process.env.PGURL || 'postgresql://karvon:karvon_dev_password@localhost:5432/karvon';

let pass = 0;
let fail = 0;

const ok = (name, value) => {
  console.log(`  \x1b[32m[OK]\x1b[0m   ${name.padEnd(52)} ${String(value).slice(0, 38)}`);
  pass++;
};
const bad = (name, expected, got) => {
  console.log(`  \x1b[31m[XATO]\x1b[0m ${name.padEnd(52)} kutilgan=${expected} olingan=${got}`);
  fail++;
};
const check = (name, expected, got) =>
  String(expected) === String(got) ? ok(name, got) : bad(name, expected, got);
const step = (name) => console.log(`\n\x1b[36m>> ${name}\x1b[0m`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const adminApi = (path, options = {}, token) =>
  api(path, options, token);

async function main() {
  const pg = new Client({ connectionString: PGURL });
  await pg.connect();

  // Test uchun admin yaratamiz (TOTP kalitini biz belgilaymiz)
  const email = `test-admin-${Date.now()}@karvon.uz`;
  const secret = authenticator.generateSecret();

  // Parol xeshi uchun mavjud adminning xeshidan foydalanamiz
  const template = await pg.query(
    `SELECT password_hash FROM admin_users WHERE email = 'admin@karvon.uz'`,
  );
  if (template.rows.length === 0) {
    throw new Error("admin@karvon.uz topilmadi — avval `npm run admin:create` ni ishga tushiring");
  }
  const passwordHash = template.rows[0].password_hash;
  const PASSWORD = 'Karvon!Admin2026';

  const superRole = await pg.query(`SELECT id FROM admin_roles WHERE code = 'SUPER_ADMIN'`);
  const moderatorRole = await pg.query(`SELECT id FROM admin_roles WHERE code = 'MODERATOR'`);

  await pg.query(
    `INSERT INTO admin_users (email, password_hash, full_name, role_id, totp_secret_enc, is_active)
     VALUES ($1, $2, 'Test Admin', $3, $4, TRUE)`,
    [email, passwordHash, superRole.rows[0].id, Buffer.from(secret, 'utf8')],
  );

  const modEmail = `test-mod-${Date.now()}@karvon.uz`;
  const modSecret = authenticator.generateSecret();
  await pg.query(
    `INSERT INTO admin_users (email, password_hash, full_name, role_id, totp_secret_enc, is_active)
     VALUES ($1, $2, 'Test Moderator', $3, $4, TRUE)`,
    [modEmail, passwordHash, moderatorRole.rows[0].id, Buffer.from(modSecret, 'utf8')],
  );

  // ------------------------------------------------------- kirish
  step('Admin kirishi: parol + majburiy TOTP');

  const noTotp = await adminApi('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, totp: '000000' }),
  });
  check('★ NOTOʻGʻRI TOTP RAD ETILDI', 'AUTH_UNAUTHORIZED', noTotp.error?.code);

  const badPassword = await adminApi('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'NotoQriParol123',
      totp: authenticator.generate(secret),
    }),
  });
  check('notoʻgʻri parol rad etildi', 'AUTH_UNAUTHORIZED', badPassword.error?.code);
  check('xato xabari umumiy (email oshkor emas)', 'Email yoki parol notoʻgʻri', badPassword.error?.message);

  const unknownEmail = await adminApi('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'yoq@karvon.uz',
      password: PASSWORD,
      totp: authenticator.generate(secret),
    }),
  });
  check('mavjud boʻlmagan email — bir xil xabar', 'Email yoki parol notoʻgʻri', unknownEmail.error?.message);

  const session = await adminApi('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, totp: authenticator.generate(secret) }),
  });
  check('★ ADMIN KIRDI', 'SUPER_ADMIN', session.data?.admin?.role);
  const adminToken = session.data.accessToken;

  const me = await adminApi('/admin/me', {}, adminToken);
  check('joriy admin', email, me.data?.email);

  // ------------------------------------------------- tokenlar ajratilgan
  step('Tokenlar ajratilgan');
  const fx = await createOrderFixture();

  const userOnAdmin = await adminApi('/admin/dashboard', {}, fx.shipperToken);
  check('★ FOYDALANUVCHI TOKENI ADMINDA ISHLAMAYDI', true, Boolean(userOnAdmin.error));

  const adminOnUser = await api('/me', {}, adminToken);
  check('★ ADMIN TOKENI FOYDALANUVCHIDA ISHLAMAYDI', true, Boolean(adminOnUser.error));

  const noToken = await adminApi('/admin/dashboard', {});
  check('tokensiz rad etiladi', 'AUTH_UNAUTHORIZED', noToken.error?.code);

  // ---------------------------------------------------------- huquqlar
  step('Huquqlar');
  const modSession = await adminApi('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: modEmail,
      password: PASSWORD,
      totp: authenticator.generate(modSecret),
    }),
  });
  const modToken = modSession.data.accessToken;
  check('moderator kirdi', 'MODERATOR', modSession.data?.admin?.role);

  const modQueue = await adminApi('/admin/verifications', {}, modToken);
  check('moderator navbatni koʻradi', true, Array.isArray(modQueue.data?.documents));

  const modPayouts = await adminApi('/admin/payouts', {}, modToken);
  check('★ MODERATOR MOLIYAGA KIRA OLMAYDI', 'ADMIN_PERMISSION_DENIED', modPayouts.error?.code);

  const modSettings = await adminApi('/admin/settings', {}, modToken);
  check('★ MODERATOR SOZLAMAGA KIRA OLMAYDI', 'ADMIN_PERMISSION_DENIED', modSettings.error?.code);

  const superPayouts = await adminApi('/admin/payouts', {}, adminToken);
  check('super admin hamma joyga kiradi', true, Array.isArray(superPayouts.data));

  // ------------------------------------------------------ verifikatsiya
  step('Verifikatsiya navbati');
  const pendingPhone = `+99894${Math.floor(Math.random() * 9000000 + 1000000)}`;
  const pendingToken = await login(pendingPhone, 'DRIVER');
  await api(
    '/vehicles',
    {
      method: 'POST',
      body: JSON.stringify({
        vehicleTypeId: 4,
        bodyTypeId: 1,
        brand: 'MAN',
        model: 'TGX',
        plateNumber: randomPlate(),
        capacityKg: 5000,
        volumeM3: 25,
      }),
    },
    pendingToken,
  );
  const pendingUser = await pg.query('SELECT id FROM users WHERE phone = $1', [pendingPhone]);
  const pendingDriverId = pendingUser.rows[0].id;

  await pg.query(
    `UPDATE driver_profiles SET verification_status = 'PENDING' WHERE user_id = $1`,
    [pendingDriverId],
  );
  const pendingVehicle = await pg.query(
    `UPDATE vehicles SET verification_status = 'PENDING' WHERE driver_id = $1 RETURNING id`,
    [pendingDriverId],
  );

  const queue = await adminApi('/admin/verifications', {}, adminToken);
  check(
    '★ NAVBATDA HAYDOVCHI BOR',
    true,
    queue.data.drivers.some((d) => d.userId === pendingDriverId),
  );
  check(
    'navbatda transport bor',
    true,
    queue.data.vehicles.some((v) => v.id === pendingVehicle.rows[0].id),
  );

  const approveDriver = await adminApi(
    `/admin/drivers/${pendingDriverId}/review`,
    { method: 'POST', body: JSON.stringify({ approve: true }) },
    adminToken,
  );
  check('haydovchi tasdiqlandi', true, approveDriver.data?.ok);

  const verified = await pg.query(
    'SELECT verification_status, verified_by FROM driver_profiles WHERE user_id = $1',
    [pendingDriverId],
  );
  check('★ BAZADA TASDIQLANDI', 'VERIFIED', verified.rows[0].verification_status);
  check('tasdiqlagan admin yozildi', true, Boolean(verified.rows[0].verified_by));

  const rejectVehicle = await adminApi(
    `/admin/vehicles/${pendingVehicle.rows[0].id}/review`,
    { method: 'POST', body: JSON.stringify({ approve: false, reason: 'Rasm sifati past' }) },
    adminToken,
  );
  check('transport rad etildi', true, rejectVehicle.data?.ok);

  const notified = await pg.query(
    `SELECT count(*)::int AS n FROM notifications
      WHERE user_id = $1 AND template_key = 'document.reviewed'`,
    [pendingDriverId],
  );
  check('★ HAYDOVCHI XABARDOR QILINDI', true, notified.rows[0].n >= 2);

  // ------------------------------------------------- hujjatni ko'rish
  step('Hujjatni koʻrish havolasi va uning auditi');

  // Hujjat yozuvi TO'G'RIDAN-TO'G'RI bazaga: haqiqiy yuklash S3 talab
  // qiladi, imzo yasash esa tarmoqqa chiqmaydi va shusiz ham sinaladi
  const docRow = await pg.query(
    `INSERT INTO documents (owner_type, owner_id, type, file_key, file_name, mime_type,
                            page_side, uploaded_by, verification_status)
     VALUES ('USER', $1, 'PASSPORT', $2, 'passport.jpg', 'image/jpeg', 'FRONT', $1, 'PENDING')
     RETURNING id`,
    [pendingDriverId, `document/${pendingDriverId}/2026/09/test.jpg`],
  );
  const documentId = docRow.rows[0].id;

  const view = await adminApi(`/admin/documents/${documentId}/url`, {}, adminToken);
  check('★ IMZOLANGAN HAVOLA QAYTDI', true, String(view.data?.url).includes('X-Amz-Signature'));
  check('hujjat turi qaytdi', 'PASSPORT', view.data?.type);
  check('tomoni qaytdi', 'FRONT', view.data?.pageSide);

  // ASOSIY TEKSHIRUV: hujjatda pasport raqami va PINFL bo'ladi, shuning
  // uchun kim qachon kimning hujjatini ochgani yozilishi SHART
  const viewAudit = await pg.query(
    `SELECT admin_id, user_id, entity_id FROM audit_logs
      WHERE action = 'document.view' AND entity_id = $1`,
    [documentId],
  );
  check('★ KOʻRISH AUDITGA YOZILDI', 1, viewAudit.rows.length);
  check('kimning hujjati ekani yozildi', pendingDriverId, viewAudit.rows[0]?.user_id);

  // Ikkinchi ochish — ikkinchi yozuv. "Bir marta yozib qo'yish" yetarli
  // emas: qayta-qayta ochish shubhali xatti-harakat va u ko'rinishi kerak
  await adminApi(`/admin/documents/${documentId}/url`, {}, adminToken);
  const viewAudit2 = await pg.query(
    `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'document.view' AND entity_id = $1`,
    [documentId],
  );
  check('★ HAR BIR OCHISH ALOHIDA YOZILADI', 2, viewAudit2.rows[0].n);

  const missingDoc = await adminApi(
    '/admin/documents/00000000-0000-0000-0000-000000000000/url',
    {},
    adminToken,
  );
  check('mavjud boʻlmagan hujjat — 404', true, Boolean(missingDoc.error));

  const modViewsDoc = await adminApi(`/admin/documents/${documentId}/url`, {}, modToken);
  // Moderatorning ishi aynan shu: hujjatni ko'rmasdan tekshirib bo'lmaydi
  check('★ MODERATOR HUJJATNI KOʻRA OLADI', true, Boolean(modViewsDoc.data?.url));

  // -------------------------------------------------- foydalanuvchi bloklash
  step('Foydalanuvchini bloklash');
  const beforeBan = await api('/me', {}, fx.shipperToken);
  check('foydalanuvchi tokeni ishlayapti', true, Boolean(beforeBan.data?.id));

  const ban = await adminApi(
    `/admin/users/${fx.shipperId}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'BANNED', reason: 'Firibgarlik shubhasi' }) },
    adminToken,
  );
  check('bloklandi', true, ban.data?.ok);
  await sleep(300);

  const afterBan = await api('/me', {}, fx.shipperToken);
  check('★ SESSIYA DARHOL BEKOR BOʻLDI', true, Boolean(afterBan.error));

  const banned = await pg.query('SELECT status, token_version FROM users WHERE id = $1', [
    fx.shipperId,
  ]);
  check('holat BANNED', 'BANNED', banned.rows[0].status);
  check('token_version oshirildi', true, banned.rows[0].token_version > 0);

  // ---------------------------------------------------------- sozlamalar
  step('Sozlamalar');
  const settings = await adminApi('/admin/settings', {}, adminToken);
  check('sozlamalar roʻyxati', true, settings.data.length >= 9);

  const before = await pg.query(
    `SELECT value FROM platform_settings WHERE key = 'commission.default_rate'`,
  );

  const update = await adminApi(
    '/admin/settings/commission.default_rate',
    { method: 'PUT', body: JSON.stringify({ value: 0.08 }) },
    adminToken,
  );
  check('sozlama oʻzgartirildi', true, update.data?.ok);

  const after = await pg.query(
    `SELECT value, updated_by FROM platform_settings WHERE key = 'commission.default_rate'`,
  );
  check('★ BAZADA OʻZGARDI', 0.08, after.rows[0].value);
  check('kim oʻzgartirgani yozildi', true, Boolean(after.rows[0].updated_by));

  // Qaytaramiz
  await adminApi(
    '/admin/settings/commission.default_rate',
    { method: 'PUT', body: JSON.stringify({ value: Number(before.rows[0].value) }) },
    adminToken,
  );

  // ------------------------------------------------------------- audit
  step('Audit jurnali');
  const logs = await adminApi('/admin/audit-logs', {}, adminToken);
  check('★ AUDIT YOZUVLARI BOR', true, logs.data.length >= 5);

  const banLog = logs.data.find((l) => l.action === 'user.banned');
  check('bloklash yozuvi bor', true, Boolean(banLog));
  check('oldingi holat saqlangan', 'ACTIVE', banLog?.before?.status);
  check('yangi holat saqlangan', 'BANNED', banLog?.after?.status);
  check('admin koʻrsatilgan', email, banLog?.adminEmail);
  check('IP yozilgan', true, Boolean(banLog?.ip));

  const settingsLog = logs.data.find((l) => l.action === 'settings.update');
  check('★ SOZLAMA OʻZGARISHI AUDITDA', true, Boolean(settingsLog));

  // ------------------------------------------------------ boshqaruv paneli
  step('Boshqaruv paneli');
  const dashboard = await adminApi('/admin/dashboard', {}, adminToken);
  check('foydalanuvchilar soni', true, dashboard.data.users.total > 0);
  check('buyurtmalar soni', true, dashboard.data.orders.total > 0);
  check('★ DAROMAD HISOBLANDI', true, BigInt(dashboard.data.revenue.totalTiyin) > 0n);
  check('daromad formatlangan', true, dashboard.data.revenue.totalFormatted.includes('soʻm'));

  const integrity = await adminApi('/admin/ledger/integrity', {}, adminToken);
  check('★ LEDGER BUTUN', true, integrity.data.ok);

  // ------------------------------------------------------- kunlik dinamika
  step('Kunlik dinamika (grafiklar uchun)');

  const series = await adminApi('/admin/dashboard/series?days=7', {}, adminToken);
  // BO'SH KUNLAR NOL BILAN: buyurtma bo'lmagan kun grafikdan tushib
  // qolsa, chiziq qo'shni kunlarni to'g'ridan-to'g'ri bog'laydi va
  // pasayish umuman ko'rinmaydi — grafik yolg'on gapiradi
  check('★ HAR BIR KUN QATORDA BOR', 7, series.data?.length);
  check(
    '★ BOʻSH KUNLAR NOL BILAN TOʻLDIRILDI',
    true,
    series.data.every((row) => typeof row.created === 'number' && row.created >= 0),
  );
  check(
    'sanalar oʻsish tartibida',
    true,
    series.data.every((row, i) => i === 0 || series.data[i - 1].date < row.date),
  );
  check('sana formati YYYY-MM-DD', true, /^\d{4}-\d{2}-\d{2}$/.test(series.data[0].date));

  // Bugun buyurtma yaratildi (fixture) — oxirgi kunda ko'rinishi kerak
  const today = series.data[series.data.length - 1];
  check('★ BUGUNGI BUYURTMA QATORDA', true, today.created > 0);

  // Pul SATR sifatida: tiyin qiymati Number chegarasidan oshishi mumkin
  check('★ PUL SATR SIFATIDA QAYTADI', 'string', typeof today.gmvTiyin);
  check('komissiya ham satr', 'string', typeof today.commissionTiyin);

  const tooLong = await adminApi('/admin/dashboard/series?days=365', {}, adminToken);
  // Cheksiz oraliq butun `orders` jadvalini skanerlashga aylanadi
  check('★ 90 KUNDAN UZUN ORALIQ RAD ETILADI', true, Boolean(tooLong.error));

  const defaultDays = await adminApi('/admin/dashboard/series', {}, adminToken);
  check('parametrsiz — 30 kun', 30, defaultDays.data?.length);

  // ------------------------------------------------------------ bloklash
  step('Notoʻgʻri urinishlarda bloklash');
  for (let i = 0; i < 5; i++) {
    await adminApi('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: modEmail, password: 'NotoQri123456', totp: '000000' }),
    });
  }

  const locked = await adminApi('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: modEmail,
      password: PASSWORD,
      totp: authenticator.generate(modSecret),
    }),
  });
  check('★ 5 URINISHDAN KEYIN BLOKLANDI', 'ADMIN_ACCOUNT_LOCKED', locked.error?.code);

  await fx.pg.end();
  await pg.end();

  console.log('\n\x1b[1m========== ADMIN NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

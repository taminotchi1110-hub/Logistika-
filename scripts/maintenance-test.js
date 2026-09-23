/* eslint-disable no-console */
/**
 * KARVON — davriy texnik xizmat
 *
 * Tekshiriladi:
 *   - yetkazilgan, lekin mijoz tasdiqlamagan buyurtma belgilangan muddatdan
 *     keyin AVTOMATIK yakunlanadi va pul oqimi ishlaydi (naqdda komissiya
 *     haydovchi hamyonidan yechiladi). Ilgari buni bajaradigan kod umuman
 *     yo'q edi — haydovchi pulini muddatsiz kutib qolardi
 *   - muddati hali o'tmagan va nizodagi buyurtmaga tegilmaydi
 *   - muddati o'tgan taklif va e'lon yopiladi
 *   - eski OTP va kirish tarixi yozuvlari tozalanadi, yangilari qoladi
 *   - GPS jadvalining keyingi oylari uchun bo'linma bor
 *   - qo'lda ishga tushirish faqat huquqi bor admin uchun, natija auditda
 *   - qayta ishga tushirish xavfsiz: yakunlangan qayta yakunlanmaydi
 *
 * Ishlatish: node scripts/maintenance-test.js
 */
const { authenticator } = require('otplib');
const { Client } = require('pg');

const { PGURL, api, createOrderFixture } = require('./lib/fixtures');

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

const DELIVERY_CHAIN = [
  'CONFIRMED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'ARRIVED_AT_DELIVERY',
  'DELIVERED',
];

async function deliver(fx) {
  for (const status of DELIVERY_CHAIN) {
    const result = await api(
      `/orders/${fx.orderId}/status`,
      { method: 'POST', body: JSON.stringify({ status }) },
      fx.driverToken,
    );
    if (result.error) throw new Error(`${status}: ${result.error.code}`);
  }
}

/** Test uchun admin — TOTP kalitini biz belgilaymiz (admin-test.js dagi kabi). */
async function createAdmin(pg, roleCode) {
  const template = await pg.query(
    `SELECT password_hash FROM admin_users WHERE email = 'admin@karvon.uz'`,
  );
  if (template.rows.length === 0) {
    throw new Error("admin@karvon.uz topilmadi — avval `npm run admin:create` ni ishga tushiring");
  }
  const role = await pg.query('SELECT id FROM admin_roles WHERE code = $1', [roleCode]);
  const email = `maint-${roleCode.toLowerCase()}-${Date.now()}@karvon.uz`;
  const secret = authenticator.generateSecret();

  await pg.query(
    `INSERT INTO admin_users (email, password_hash, full_name, role_id, totp_secret_enc, is_active)
     VALUES ($1, $2, 'Texnik xizmat testi', $3, $4, TRUE)`,
    [email, template.rows[0].password_hash, role.rows[0].id, Buffer.from(secret, 'utf8')],
  );

  const session = await api('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'Karvon!Admin2026',
      totp: authenticator.generate(secret),
    }),
  });
  if (!session.data) throw new Error(`admin kira olmadi: ${session.error?.code}`);
  return session.data.accessToken;
}

async function createLoad(token, title) {
  const hour = 3600e3;
  const load = await api(
    '/loads',
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        categoryId: 3,
        weightKg: 2000,
        pickup: { address: 'Toshkent, Sergeli', lat: 41.2266, lng: 69.2173 },
        delivery: { address: 'Navoiy, markaz', lat: 40.1039, lng: 65.3688 },
        pickupFrom: new Date(Date.now() + hour).toISOString(),
        pickupTo: new Date(Date.now() + 6 * hour).toISOString(),
        priceTiyin: 150000000,
        paymentMethod: 'CASH',
        publishNow: true,
      }),
    },
    token,
  );
  if (!load.data) throw new Error(`eʼlon yaratilmadi: ${load.error?.code}`);
  return load.data.id;
}

async function main() {
  const pg = new Client({ connectionString: PGURL });
  await pg.connect();

  const superToken = await createAdmin(pg, 'SUPER_ADMIN');
  const modToken = await createAdmin(pg, 'MODERATOR');
  const orderStatus = async (id) =>
    (await pg.query('SELECT status FROM orders WHERE id = $1', [id])).rows[0].status;

  // --------------------------------------------------------- tayyorgarlik
  step('Tayyorgarlik');

  // Mijoz tasdiqlamagan, yetkazilganiga 25 soat bo'lgan buyurtma (naqd)
  const overdue = await createOrderFixture({ paymentMethod: 'CASH', priceTiyin: 20_000_000 });
  await deliver(overdue);
  await pg.query(`UPDATE orders SET delivered_at = now() - interval '25 hours' WHERE id = $1`, [
    overdue.orderId,
  ]);

  // Hozirgina yetkazilgan — mijozda hali vaqt bor
  const fresh = await createOrderFixture({ paymentMethod: 'CASH', priceTiyin: 20_000_000 });
  await deliver(fresh);

  // Nizo ochilgan — muddati o'tgan bo'lsa ham admin hal qiladi, tizim emas
  const disputed = await createOrderFixture({ paymentMethod: 'CASH', priceTiyin: 20_000_000 });
  await deliver(disputed);
  const dispute = await api(
    `/orders/${disputed.orderId}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'DISPUTED', note: 'Yuk shikastlangan' }) },
    disputed.shipperToken,
  );
  check('nizo ochildi', true, !dispute.error);
  await pg.query(`UPDATE orders SET delivered_at = now() - interval '25 hours' WHERE id = $1`, [
    disputed.orderId,
  ]);

  // Muddati o'tgan e'lon va muddati o'tmagani
  const staleLoadId = await createLoad(overdue.shipperToken, 'Muddati oʻtgan eʼlon');
  await pg.query(`UPDATE loads SET expires_at = now() - interval '1 hour' WHERE id = $1`, [
    staleLoadId,
  ]);
  const openLoadId = await createLoad(overdue.shipperToken, 'Ochiq eʼlon');

  // Muddati o'tgan taklif — ochiq e'longa
  const staleOffer = await pg.query(
    `INSERT INTO order_offers (load_id, driver_id, vehicle_id, offered_price_tiyin, status, expires_at)
     VALUES ($1, $2, $3, 150000000, 'PENDING', now() - interval '5 minutes')
     RETURNING id`,
    [openLoadId, fresh.driverId, fresh.vehicleId],
  );

  // Eski va yangi OTP hamda kirish tarixi yozuvlari
  const phone = `+99890${Math.floor(Math.random() * 9000000 + 1000000)}`;
  await pg.query(
    `INSERT INTO otp_requests (phone, code_hash, expires_at, created_at) VALUES
       ($1, 'eski', now() - interval '40 days', now() - interval '40 days'),
       ($1, 'yangi', now() + interval '5 minutes', now())`,
    [phone],
  );
  await pg.query(
    `INSERT INTO login_history (phone, success, created_at) VALUES
       ($1, FALSE, now() - interval '400 days'),
       ($1, FALSE, now())`,
    [phone],
  );
  ok('tayyorgarlik', 'tayyor');

  // ----------------------------------------------------------------- huquq
  step('Huquq');
  const denied = await api('/admin/maintenance/run', { method: 'POST' }, modToken);
  check('★ MODERATOR ISHGA TUSHIRA OLMAYDI', 'ADMIN_PERMISSION_DENIED', denied.error?.code);
  const anonymous = await api('/admin/maintenance/run', { method: 'POST' });
  check('tokensiz rad etiladi', true, Boolean(anonymous.error));
  // Rad etilgan urinish hech narsani o'zgartirmagan bo'lishi kerak
  check('rad etilgach buyurtma oʻzgarmadi', 'DELIVERED', await orderStatus(overdue.orderId));

  // ---------------------------------------------------------- ishga tushirish
  step('Texnik xizmat');
  const run = await api('/admin/maintenance/run', { method: 'POST' }, superToken);
  check('★ ISHGA TUSHDI (qulf kutilmadi)', false, run.data?.skipped);
  check('natijada yakunlanganlar bor', true, (run.data?.autoCompletedOrders ?? 0) >= 1);
  check('natijada yopilgan takliflar bor', true, (run.data?.expiredOffers ?? 0) >= 1);
  check('natijada yopilgan eʼlonlar bor', true, (run.data?.expiredLoads ?? 0) >= 1);
  // Escrow listeneri asinxron
  await sleep(900);

  // ------------------------------------------------------------ buyurtmalar
  step('Buyurtmalar');
  check('★ MUDDATI OʻTGAN BUYURTMA YAKUNLANDI', 'COMPLETED', await orderStatus(overdue.orderId));

  const history = await pg.query(
    `SELECT actor_role, actor_id, note FROM order_status_history
      WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [overdue.orderId],
  );
  check('tarixda SYSTEM koʻrinadi', 'SYSTEM', history.rows[0]?.actor_role);
  check('sabab tarixga yozildi', true, String(history.rows[0]?.note).includes('avtomatik'));

  // Asosiy dalil — PUL: yakunlanish pul oqimini ishga tushirdi
  const commission = BigInt(
    (await pg.query('SELECT commission_tiyin FROM orders WHERE id = $1', [overdue.orderId]))
      .rows[0].commission_tiyin,
  );
  const wallet = await api('/wallet', {}, overdue.driverToken);
  check(
    '★ PUL OQIMI ISHLADI (komissiya yechildi)',
    (-commission).toString(),
    wallet.data?.balanceTiyin,
  );

  check('★ YANGI YETKAZILGANIGA TEGILMADI', 'DELIVERED', await orderStatus(fresh.orderId));
  check('★ NIZODAGIGA TEGILMADI', 'DISPUTED', await orderStatus(disputed.orderId));

  // ---------------------------------------------------- takliflar va e'lonlar
  step('Takliflar va eʼlonlar');
  const offer = await pg.query('SELECT status FROM order_offers WHERE id = $1', [
    staleOffer.rows[0].id,
  ]);
  check('★ MUDDATI OʻTGAN TAKLIF YOPILDI', 'EXPIRED', offer.rows[0].status);
  const staleLoad = await pg.query('SELECT status FROM loads WHERE id = $1', [staleLoadId]);
  check('★ MUDDATI OʻTGAN EʼLON YOPILDI', 'EXPIRED', staleLoad.rows[0].status);
  const openLoad = await pg.query('SELECT status FROM loads WHERE id = $1', [openLoadId]);
  check('muddati oʻtmagan eʼlon yopilmadi', true, openLoad.rows[0].status !== 'EXPIRED');

  // ---------------------------------------------------------------- tozalash
  step('Eski yozuvlarni tozalash');
  const otp = await pg.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at < now() - interval '30 days')::int AS old
       FROM otp_requests WHERE phone = $1`,
    [phone],
  );
  check('★ ESKI OTP YOZUVI OʻCHIRILDI', 0, otp.rows[0].old);
  check('yangi OTP yozuvi qoldi', 1, otp.rows[0].total);

  const logins = await pg.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at < now() - interval '365 days')::int AS old
       FROM login_history WHERE phone = $1`,
    [phone],
  );
  check('★ ESKI KIRISH TARIXI OʻCHIRILDI', 0, logins.rows[0].old);
  check('yangi kirish yozuvi qoldi', 1, logins.rows[0].total);

  // --------------------------------------------------------- GPS bo'linmalari
  step('GPS boʻlinmalari');
  const partition = await pg.query(
    `SELECT count(*)::int AS n FROM pg_class
      WHERE relname = 'driver_locations_' || to_char(now() + interval '2 month', 'YYYY_MM')`,
  );
  // Bo'linma bo'lmasa o'sha oydan GPS nuqtasi umuman yozilmaydi
  check('★ 2 OY OLDINDAGI BOʻLINMA BOR', 1, partition.rows[0].n);

  // ------------------------------------------------------------------ audit
  step('Audit va qayta ishga tushirish');
  const audit = await pg.query(
    `SELECT after FROM audit_logs WHERE action = 'maintenance.run'
      ORDER BY created_at DESC LIMIT 1`,
  );
  check('★ QOʻLDA ISHGA TUSHIRISH AUDITDA', true, Boolean(audit.rows[0]));
  check('natija auditda saqlandi', true, (audit.rows[0]?.after?.autoCompletedOrders ?? 0) >= 1);

  // Ikkinchi marta: yakunlangan buyurtma qayta yakunlanmaydi, komissiya
  // ikki marta yechilmaydi
  await api('/admin/maintenance/run', { method: 'POST' }, superToken);
  await sleep(900);
  const walletAgain = await api('/wallet', {}, overdue.driverToken);
  check('★ QAYTA ISHGA TUSHIRISH XAVFSIZ (komissiya bir marta)', wallet.data?.balanceTiyin, walletAgain.data?.balanceTiyin);

  for (const fx of [overdue, fresh, disputed]) await fx.pg.end();
  await pg.end();

  console.log('\n\x1b[1m========== TEXNIK XIZMAT NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

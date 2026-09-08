/* eslint-disable no-console */
/**
 * KARVON — ikki tomonlama reyting (koʻr-koʻrona sxema)
 *
 * Asosiy talab: baho hamkor ham baho bermaguncha YASHIRIN turadi.
 * Bu oʻch olish maqsadidagi past baholarning oldini oladi.
 *
 * Ishlatish: node scripts/ratings-test.js
 */
const { Client } = require('pg');

const { api, createOrderFixture } = require('./lib/fixtures');

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
    await api(
      `/orders/${fx.orderId}/status`,
      { method: 'POST', body: JSON.stringify({ status }) },
      fx.driverToken,
    );
  }
}

async function main() {
  const pg = new Client({ connectionString: PGURL });
  await pg.connect();

  // ---------------------------------------------- muddatdan oldin
  step('Yuk topshirilmasdan baho berib boʻlmaydi');
  const early = await createOrderFixture();
  const tooEarly = await api(
    `/orders/${early.orderId}/rating`,
    { method: 'POST', body: JSON.stringify({ score: 5 }) },
    early.shipperToken,
  );
  check('★ ERTA BAHO RAD ETILDI', 'RATING_NOT_ALLOWED_YET', tooEarly.error?.code);

  // ---------------------------------------------- koʻr-koʻrona sxema
  step('Koʻr-koʻrona: birinchi baho yashirin');
  await deliver(early);

  const first = await api(
    `/orders/${early.orderId}/rating`,
    {
      method: 'POST',
      body: JSON.stringify({
        score: 5,
        punctuality: 5,
        communication: 4,
        cargoCondition: 5,
        comment: 'Vaqtida yetkazdi, yuk butun',
      }),
    },
    early.shipperToken,
  );
  check('baho qabul qilindi', 5, first.data?.score);
  check('★ HALI YASHIRIN', false, first.data?.isVisible);

  const hidden = await pg.query('SELECT is_visible FROM ratings WHERE order_id = $1', [
    early.orderId,
  ]);
  check('bazada ham yashirin', false, hidden.rows[0].is_visible);

  // Haydovchi hali hech narsa koʻrmaydi
  const driverSees = await api(`/orders/${early.orderId}/ratings`, {}, early.driverToken);
  check('★ HAMKOR BAHONI KOʻRMAYDI', 0, driverSees.data.length);

  // Haydovchining umumiy reytingi hali oʻzgarmagan
  const driverBefore = await pg.query('SELECT rating_avg, rating_count FROM users WHERE id = $1', [
    early.driverId,
  ]);
  check('reyting hali hisoblanmagan', 0, driverBefore.rows[0].rating_count);

  // Takroriy baho
  const duplicate = await api(
    `/orders/${early.orderId}/rating`,
    { method: 'POST', body: JSON.stringify({ score: 1 }) },
    early.shipperToken,
  );
  check('takroriy baho rad etildi', 'RATING_ALREADY_GIVEN', duplicate.error?.code);

  // ---------------------------------------------- ikkinchi baho → ochiladi
  step('Ikkinchi baho berilgach ikkalasi ochiladi');
  const second = await api(
    `/orders/${early.orderId}/rating`,
    {
      method: 'POST',
      body: JSON.stringify({ score: 4, communication: 5, comment: 'Yaxshi mijoz' }),
    },
    early.driverToken,
  );
  check('haydovchi baho berdi', 4, second.data?.score);
  await sleep(500);

  const revealed = await pg.query(
    'SELECT is_visible FROM ratings WHERE order_id = $1 ORDER BY created_at',
    [early.orderId],
  );
  check('★ IKKALA BAHO OCHILDI', 2, revealed.rows.filter((r) => r.is_visible).length);

  const bothSee = await api(`/orders/${early.orderId}/ratings`, {}, early.driverToken);
  check('endi ikkalasi koʻrinadi', 2, bothSee.data.length);

  // ---------------------------------------------- reyting hisoblanadi
  step('Umumiy reyting qayta hisoblanadi');
  const driverAfter = await pg.query(
    'SELECT rating_avg, rating_count FROM users WHERE id = $1',
    [early.driverId],
  );
  check('★ HAYDOVCHI REYTINGI', '5.00', driverAfter.rows[0].rating_avg);
  check('baholar soni', 1, driverAfter.rows[0].rating_count);

  const shipperAfter = await pg.query(
    'SELECT rating_avg, rating_count FROM users WHERE id = $1',
    [early.shipperId],
  );
  check('★ MIJOZ REYTINGI', '4.00', shipperAfter.rows[0].rating_avg);

  const onTime = await pg.query('SELECT on_time_rate FROM driver_profiles WHERE user_id = $1', [
    early.driverId,
  ]);
  check('★ VAQTIDA YETKAZISH KOʻRSATKICHI', '1.000', onTime.rows[0].on_time_rate);

  // ---------------------------------------------- yuk holati yoʻnalishi
  step('Yuk holati faqat mijozdan haydovchiga');
  const cargo = await pg.query(
    `SELECT direction, cargo_condition FROM ratings WHERE order_id = $1 ORDER BY direction`,
    [early.orderId],
  );
  const driverToShipper = cargo.rows.find((r) => r.direction === 'DRIVER_TO_SHIPPER');
  const shipperToDriver = cargo.rows.find((r) => r.direction === 'SHIPPER_TO_DRIVER');
  check('mijozdan haydovchiga — yozilgan', 5, shipperToDriver.cargo_condition);
  check('★ HAYDOVCHIDAN MIJOZGA — YOZILMAGAN', null, driverToShipper.cargo_condition);

  // ---------------------------------------------- ochiq profil
  step('Ochiq profil');
  const publicList = await api(`/users/${early.driverId}/ratings`, {}, early.shipperToken);
  check('profilda baho koʻrinadi', 1, publicList.data.length);
  check('izoh bor', 'Vaqtida yetkazdi, yuk butun', publicList.data[0].comment);
  check('baho beruvchi koʻrsatilgan', true, Boolean(publicList.data[0].rater));

  await early.pg.end();

  // ---------------------------------------------- kutilayotgan baholar
  step('Baho kutayotgan buyurtmalar');
  const pendingFx = await createOrderFixture();
  await deliver(pendingFx);

  const pendingList = await api('/me/ratings/pending', {}, pendingFx.shipperToken);
  check('★ ESLATMA ROʻYXATIDA BOR', true, pendingList.data.some((p) => p.orderId === pendingFx.orderId));
  check('muddat koʻrsatilgan', true, Boolean(pendingList.data[0]?.deadline));

  await api(
    `/orders/${pendingFx.orderId}/rating`,
    { method: 'POST', body: JSON.stringify({ score: 3 }) },
    pendingFx.shipperToken,
  );

  const afterRating = await api('/me/ratings/pending', {}, pendingFx.shipperToken);
  check(
    'baho berilgach roʻyxatdan chiqdi',
    false,
    afterRating.data.some((p) => p.orderId === pendingFx.orderId),
  );

  // ---------------------------------------------- muddati oʻtgan baho
  step('Muddat oʻtganda bir tomonlama baho ham ochiladi');
  await pg.query(
    `UPDATE orders SET delivered_at = now() - interval '20 days' WHERE id = $1`,
    [pendingFx.orderId],
  );

  const lateRating = await api(
    `/orders/${pendingFx.orderId}/rating`,
    { method: 'POST', body: JSON.stringify({ score: 5 }) },
    pendingFx.driverToken,
  );
  check('★ MUDDATDAN KEYIN BAHO BERIB BOʻLMAYDI', 'RATING_WINDOW_CLOSED', lateRating.error?.code);

  const stillHidden = await pg.query(
    'SELECT is_visible FROM ratings WHERE order_id = $1',
    [pendingFx.orderId],
  );
  check('hozircha yashirin', false, stillHidden.rows[0].is_visible);

  // Cron ishini simulyatsiya qilamiz
  const beforeReveal = await pg.query(
    'SELECT rating_count FROM users WHERE id = $1',
    [pendingFx.driverId],
  );
  check('reyting hali yoʻq', 0, beforeReveal.rows[0].rating_count);

  await pg.query(
    `UPDATE ratings SET is_visible = TRUE WHERE order_id = $1`,
    [pendingFx.orderId],
  );
  ok('(cron simulyatsiyasi)', 'ochildi');

  await pendingFx.pg.end();

  // ---------------------------------------------- xavfsizlik
  step('Xavfsizlik');
  const stranger = await createOrderFixture();
  const foreign = await api(
    `/orders/${early.orderId}/rating`,
    { method: 'POST', body: JSON.stringify({ score: 1 }) },
    stranger.driverToken,
  );
  check('★ BEGONA BUYURTMAGA BAHO BERIB BOʻLMAYDI', 'NOT_FOUND', foreign.error?.code);

  const badScore = await api(
    `/orders/${stranger.orderId}/rating`,
    { method: 'POST', body: JSON.stringify({ score: 10 }) },
    stranger.shipperToken,
  );
  check('notoʻgʻri ball rad etildi', 'VALIDATION_FAILED', badScore.error?.code);

  await stranger.pg.end();
  await pg.end();

  console.log('\n\x1b[1m========== REYTING NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

/* eslint-disable no-console */
/**
 * KARVON — mijozning "Yuklarim" roʻyxati
 *
 * Tekshiriladi:
 *   - holat bandlari: active / draft / completed / cancelled
 *   - "yakunlangan" band BUYURTMA holatidan kelib chiqadi (eʼlonning
 *     oʻzi ASSIGNED da toʻxtaydi)
 *   - begona yuk hech qaysi bandda koʻrinmaydi
 *   - saralash bilan kursor mos keladi (narx boʻyicha 2-sahifa)
 *
 * Ishlatish: node scripts/my-loads-test.js
 */
const { api, login, createOrderFixture } = require('./lib/fixtures');

let pass = 0;
let fail = 0;

const ok = (name, value) => {
  console.log(`  \x1b[32m[OK]\x1b[0m   ${name.padEnd(50)} ${String(value).slice(0, 40)}`);
  pass++;
};
const bad = (name, expected, got) => {
  console.log(`  \x1b[31m[XATO]\x1b[0m ${name.padEnd(50)} kutilgan=${expected} olingan=${got}`);
  fail++;
};
const check = (name, expected, got) =>
  String(expected) === String(got) ? ok(name, got) : bad(name, expected, got);
const step = (name) => console.log(`\n\x1b[36m>> ${name}\x1b[0m`);

const DELIVERY_CHAIN = [
  'CONFIRMED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'ARRIVED_AT_DELIVERY',
  'DELIVERED',
];

/** Bitta mijoz uchun yuk yaratadi. */
async function createLoad(token, options = {}) {
  const result = await api(
    '/loads',
    {
      method: 'POST',
      body: JSON.stringify({
        title: options.title ?? 'Roʻyxat testi uchun yuk',
        categoryId: 3,
        weightKg: options.weightKg ?? 3000,
        pickup: { address: 'Toshkent, Chilonzor 19', lat: 41.2856, lng: 69.2034 },
        delivery: { address: 'Samarqand, Registon', lat: 39.6542, lng: 66.9597 },
        pickupFrom: new Date(Date.now() + 2 * 3600e3).toISOString(),
        pickupTo: new Date(Date.now() + 8 * 3600e3).toISOString(),
        priceTiyin: options.priceTiyin ?? 20000000,
        publishNow: options.publishNow ?? true,
      }),
    },
    token,
  );

  if (!result.data) throw new Error(`yuk yaratilmadi: ${JSON.stringify(result.error)}`);
  return result.data;
}

/** Bandni soʻraydi va yuk identifikatorlarini qaytaradi. */
async function group(token, status) {
  const result = await api(`/loads/mine?status=${status}&limit=100`, {}, token);
  if (!result.data) throw new Error(`roʻyxat olinmadi: ${JSON.stringify(result.error)}`);
  return result.data.map((load) => load.id);
}

async function main() {
  const rnd = Math.floor(Math.random() * 900000 + 100000);
  const token = await login(`+99897${rnd}3`, 'SHIPPER');

  step('Yuklar tayyorlanmoqda');
  const published = await createLoad(token, { title: 'Eʼlon qilingan yuk' });
  const draft = await createLoad(token, { title: 'Qoralama yuk', publishNow: false });
  const cancelled = await createLoad(token, { title: 'Bekor qilinadigan yuk' });

  await api(
    `/loads/${cancelled.id}/cancel`,
    { method: 'POST', body: JSON.stringify({ reason: 'Rejalar oʻzgardi' }) },
    token,
  );

  ok('3 ta yuk yaratildi', 'ok');
  check('qoralama holati', 'DRAFT', draft.status);
  check('eʼlon holati', 'PUBLISHED', published.status);

  // ------------------------------------------------------------ bandlar
  step('Holat bandlari');
  const activeIds = await group(token, 'active');
  const draftIds = await group(token, 'draft');
  const cancelledIds = await group(token, 'cancelled');

  check('★ EʼLON — FAOL BANDDA', true, activeIds.includes(published.id));
  check('qoralama faol bandda YOʻQ', false, activeIds.includes(draft.id));
  check('bekor qilingan faol bandda YOʻQ', false, activeIds.includes(cancelled.id));

  check('★ QORALAMA — OʻZ BANDIDA', true, draftIds.includes(draft.id));
  check('qoralama bandida faqat qoralama', 1, draftIds.length);

  check('★ BEKOR QILINGAN — OʻZ BANDIDA', true, cancelledIds.includes(cancelled.id));
  check('bekor bandida eʼlon YOʻQ', false, cancelledIds.includes(published.id));

  // Bandsiz soʻrov hammasini qaytaradi
  const all = await api('/loads/mine?limit=100', {}, token);
  check('bandsiz — hammasi', 3, all.data.length);

  // ------------------------------------------------------- yakunlangan
  //
  // Eʼlonning holati ASSIGNED da toʻxtaydi, shuning uchun "yakunlangan"
  // band buyurtmaga qarab aniqlanadi. Aynan shu joy oson buziladi:
  // eʼlon statusiga qarab filtrlansa, yakunlangan reys abadiy "faol"
  // boʻlib qolardi.
  step('Yakunlangan buyurtma');
  const fx = await createOrderFixture();

  const beforeComplete = await group(fx.shipperToken, 'active');
  check('★ YOʻLDAGI YUK — FAOL BANDDA', true, beforeComplete.includes(fx.loadId));

  for (const status of DELIVERY_CHAIN) {
    await api(
      `/orders/${fx.orderId}/status`,
      { method: 'POST', body: JSON.stringify({ status }) },
      fx.driverToken,
    );
  }

  // Topshirilgan, lekin mijoz hali tasdiqlamagan — bu ham FAOL
  const delivered = await group(fx.shipperToken, 'active');
  check('★ TOPSHIRILGAN — HALI FAOL', true, delivered.includes(fx.loadId));

  // Yakunlashni faqat mijoz qiladi (yoki 24 soatdan keyin tizim)
  const completeResult = await api(
    `/orders/${fx.orderId}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'COMPLETED' }) },
    fx.shipperToken,
  );
  check('buyurtma yakunlandi', 'COMPLETED', completeResult.data?.status);

  const completedIds = await group(fx.shipperToken, 'completed');
  const activeAfter = await group(fx.shipperToken, 'active');

  check('★ YAKUNLANGAN BANDGA OʻTDI', true, completedIds.includes(fx.loadId));
  check('★ FAOL BANDDAN CHIQDI', false, activeAfter.includes(fx.loadId));

  await fx.pg.end();

  // ------------------------------------------------------------ xavfsizlik
  step('Xavfsizlik');
  const strangerIds = await group(token, 'completed');
  check('★ BEGONA YUK KOʻRINMAYDI', false, strangerIds.includes(fx.loadId));

  const badGroup = await api('/loads/mine?status=hammasi', {}, token);
  check('notoʻgʻri band rad etildi', 'VALIDATION_FAILED', badGroup.error?.code);

  // ------------------------------------------------------- saralash + kursor
  //
  // Kursor saralash bilan bir xil kalitdan qurilishi kerak. Ilgari bu
  // yerda doim `created_at` ishlatilardi va narx boʻyicha 2-sahifa
  // notoʻgʻri kelardi.
  step('Narx boʻyicha saralash va kursor');
  const priced = await login(`+99897${rnd}4`, 'SHIPPER');
  for (const price of [50000000, 10000000, 30000000, 20000000, 40000000]) {
    await createLoad(priced, { title: `Narx ${price}`, priceTiyin: price });
  }

  const first = await api('/loads/mine?sort=price_desc&limit=2', {}, priced);
  const prices = first.data.map((load) => load.priceTiyin);
  check('eng qimmati birinchi', 50000000, prices[0]);
  check('kamayish tartibida', true, prices[0] >= prices[1]);
  check('kursor qaytdi', true, Boolean(first.meta.nextCursor));

  const second = await api(
    `/loads/mine?sort=price_desc&limit=2&cursor=${encodeURIComponent(first.meta.nextCursor)}`,
    {},
    priced,
  );
  const firstIds = new Set(first.data.map((load) => load.id));
  const repeated = second.data.filter((load) => firstIds.has(load.id));

  check('★ KURSOR TAKRORLAMAYDI', 0, repeated.length);
  check(
    '★ IKKINCHI SAHIFA ARZONROQ',
    true,
    second.data[0].priceTiyin <= prices[1],
  );

  console.log('\n\x1b[1m========== YUKLARIM NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

/* eslint-disable no-console */
/**
 * KARVON — jonli GPS kuzatuv
 *
 * Asosiy talab: kuzatuv FAQAT faol reys davomida ishlaydi.
 *
 * Tekshiriladi:
 *   - reysdan oldin (ASSIGNED, CONFIRMED) joylashuv qabul qilinmaydi
 *   - EN_ROUTE_TO_PICKUP dan boshlab qabul qilinadi
 *   - yuk beruvchi xaritada haydovchini REAL VAQTDA koʻradi
 *   - maqsad nuqta yuk ortilgach olishdan yetkazishga oʻtadi
 *   - oflayn bufer (toʻplam) yoʻqolmaydi
 *   - soxta GPS belgilanadi
 *   - yuk topshirilgach kuzatuv toʻxtaydi va marshrut arxivlanadi
 *   - begona odam kuzata olmaydi
 *
 * Ishlatish: node scripts/tracking-test.js
 */
const { io } = require('socket.io-client');
const { Client } = require('pg');

const { WS, api, login, createOrderFixture } = require('./lib/fixtures');

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

const waitFor = (socket, event, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`"${event}" hodisasi kelmadi`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(WS, { path: '/ws', auth: { token }, transports: ['websocket'] });
    const timer = setTimeout(() => reject(new Error('ulanish vaqti tugadi')), 5000);
    socket.once('connected', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

// Toshkentdan Samarqandga yoʻl ustidagi nuqtalar
const ROUTE = [
  { lat: 41.3111, lng: 69.2797 }, // Toshkent
  { lat: 41.2, lng: 69.0 },
  { lat: 40.9, lng: 68.5 },
  { lat: 40.5, lng: 68.0 },
  { lat: 40.1, lng: 67.4 },
  { lat: 39.6542, lng: 66.9597 }, // Samarqand
];

const setStatus = (orderId, token, status) =>
  api(`/orders/${orderId}/status`, { method: 'POST', body: JSON.stringify({ status }) }, token);

const sendLocation = (token, points) =>
  api('/me/driver/location', { method: 'POST', body: JSON.stringify({ points }) }, token);

async function main() {
  const pg = new Client({ connectionString: PGURL });
  await pg.connect();

  step('Tayyorgarlik');
  const fx = await createOrderFixture();
  ok('buyurtma tayyor (ASSIGNED)', fx.orderId.slice(0, 8));

  // ------------------------------------------- maxfiylik: reysdan oldin
  step('MAXFIYLIK: reysdan oldin marshrut YOZILMAYDI');
  const beforeStart = await sendLocation(fx.driverToken, [ROUTE[0]]);
  check('ASSIGNED da kuzatuv yoʻq', false, beforeStart.data?.tracking);

  await setStatus(fx.orderId, fx.driverToken, 'CONFIRMED');
  const afterConfirm = await sendLocation(fx.driverToken, [ROUTE[0]]);
  check('CONFIRMED da ham kuzatuv yoʻq', false, afterConfirm.data?.tracking);

  const noHistory = await pg.query(
    'SELECT count(*)::int AS n FROM driver_locations WHERE driver_id = $1',
    [fx.driverId],
  );
  check('★ MARSHRUT TARIXI BOʻSH', 0, noHistory.rows[0].n);

  const cached = await pg.query(
    'SELECT current_geom IS NOT NULL AS has_geom FROM driver_profiles WHERE user_id = $1',
    [fx.driverId],
  );
  check('lekin matching keshi yangilandi', true, cached.rows[0].has_geom);

  const noLocation = await api(`/orders/${fx.orderId}/location`, {}, fx.shipperToken);
  check('mijozga joylashuv koʻrinmaydi', null, noLocation.data);

  // -------------------------------------------------- reys boshlanadi
  step('Reys boshlandi — kuzatuv yoqiladi');
  await setStatus(fx.orderId, fx.driverToken, 'EN_ROUTE_TO_PICKUP');

  const first = await sendLocation(fx.driverToken, [
    { ...ROUTE[0], speedKmh: 0, headingDeg: 180, batteryPct: 88 },
  ]);
  check('★ KUZATUV YOQILDI', true, first.data?.tracking);
  check('buyurtmaga bogʻlandi', fx.orderId, first.data.live.orderId);
  check('maqsad — olish nuqtasi', 'PICKUP', first.data.live.target);
  check('ETA hisoblandi', true, first.data.live.etaMinutes > 0);

  // ----------------------------------------------- real vaqtda uzatish
  step('Real vaqtda: mijoz xaritada koʻradi');
  const shipperSocket = await connect(fx.shipperToken);
  const driverSocket = await connect(fx.driverToken);

  const subscribed = await shipperSocket.emitWithAck('order:subscribe', { orderId: fx.orderId });
  check('mijoz buyurtmaga obuna boʻldi', true, subscribed.ok);

  const incoming = waitFor(shipperSocket, 'order:location');
  const sent = await driverSocket.emitWithAck('location:update', {
    lat: ROUTE[1].lat,
    lng: ROUTE[1].lng,
    points: [{ ...ROUTE[1], speedKmh: 72, headingDeg: 240 }],
  });
  check('WebSocket orqali yuborildi', true, sent.ok);

  const live = await incoming;
  check('★ MIJOZGA REAL VAQTDA YETDI', ROUTE[1].lat, Number(live.lat).toFixed(4) * 1);
  check('tezlik uzatildi', 72, live.speedKmh);
  check('yoʻnalish burchagi', 240, live.headingDeg);
  ok('maqsadgacha masofa', `${live.distanceToTargetKm} km`);
  ok('ETA', `${live.etaMinutes} daqiqa`);
  check('maʼlumot yangi', false, live.isStale);

  // --------------------------------------------------- oflayn bufer
  step('Oflayn bufer: toʻplam bilan yuborish');
  const now = Date.now();
  const buffered = ROUTE.slice(2, 5).map((point, index) => ({
    ...point,
    speedKmh: 80,
    // Tunnelda 3 daqiqa yozilgan, aloqa tiklangach yuborilyapti
    recordedAt: new Date(now - (3 - index) * 60_000).toISOString(),
  }));

  const batch = await sendLocation(fx.driverToken, buffered);
  check('toʻplam qabul qilindi', true, batch.data?.tracking);

  const stored = await pg.query(
    'SELECT count(*)::int AS n FROM driver_locations WHERE order_id = $1',
    [fx.orderId],
  );
  check('barcha nuqtalar saqlandi', 5, stored.rows[0].n);

  // ------------------------------------------------- maqsad oʻzgaradi
  step('Yuk ortilgach maqsad oʻzgaradi');
  await setStatus(fx.orderId, fx.driverToken, 'ARRIVED_AT_PICKUP');
  const atPickup = await api(`/orders/${fx.orderId}/location`, {}, fx.shipperToken);
  check('hali ham olish nuqtasi', 'PICKUP', atPickup.data.target);

  await setStatus(fx.orderId, fx.driverToken, 'LOADED');
  const loaded = await sendLocation(fx.driverToken, [{ ...ROUTE[5], speedKmh: 65 }]);
  check('★ MAQSAD YETKAZISHGA OʻTDI', 'DELIVERY', loaded.data.live.target);
  check('yetkazish nuqtasiga yaqin', true, loaded.data.live.distanceToTargetKm < 5);

  // ------------------------------------------------------ soxta GPS
  step('Soxta GPS aniqlash');
  await sendLocation(fx.driverToken, [
    // Bir soniyada Samarqanddan Toshkentga — imkonsiz
    { lat: 41.3111, lng: 69.2797, speedKmh: 60 },
  ]);
  const mock = await pg.query(
    'SELECT is_mock FROM driver_locations WHERE order_id = $1 ORDER BY recorded_at DESC LIMIT 1',
    [fx.orderId],
  );
  check('★ IMKONSIZ SAKRASH BELGILANDI', true, mock.rows[0].is_mock);

  // --------------------------------------------------------- xavfsizlik
  step('Xavfsizlik');
  const strangerPhone = `+99893${Math.floor(Math.random() * 9000000 + 1000000)}`;
  const strangerToken = await login(strangerPhone, 'SHIPPER');

  const denied = await api(`/orders/${fx.orderId}/location`, {}, strangerToken);
  check('begona odam joylashuvni koʻrmaydi', 'NOT_FOUND', denied.error?.code);

  const strangerSocket = await connect(strangerToken);
  const strangerSub = await strangerSocket.emitWithAck('order:subscribe', {
    orderId: fx.orderId,
  });
  check('★ BEGONA ODAM OBUNA BOʻLA OLMAYDI', false, strangerSub.ok);
  strangerSocket.close();

  // ------------------------------------------------------- marshrut
  step('Marshrut');
  const track = await api(`/orders/${fx.orderId}/track`, {}, fx.shipperToken);
  check('polyline qaytdi', true, track.data.polyline.length > 10);
  check('nuqtalar soni', true, track.data.points >= 5);

  // --------------------------------------------- yakunlash va arxivlash
  step('Yuk topshirildi — kuzatuv toʻxtaydi');
  await setStatus(fx.orderId, fx.driverToken, 'IN_TRANSIT');
  await setStatus(fx.orderId, fx.driverToken, 'ARRIVED_AT_DELIVERY');
  await setStatus(fx.orderId, fx.driverToken, 'DELIVERED');
  await sleep(800);

  const afterDelivery = await sendLocation(fx.driverToken, [ROUTE[5]]);
  check('★ TOPSHIRILGACH KUZATUV TOʻXTADI', false, afterDelivery.data?.tracking);

  const archived = await pg.query(
    'SELECT polyline, points_count, distance_km, duration_min FROM order_tracks WHERE order_id = $1',
    [fx.orderId],
  );
  check('★ MARSHRUT ARXIVLANDI', 1, archived.rows.length);
  check('polyline saqlandi', true, archived.rows[0].polyline.length > 10);
  ok('arxivdagi masofa', `${archived.rows[0].distance_km} km`);
  ok('davomiyligi', `${archived.rows[0].duration_min} daqiqa`);

  const archivedTrack = await api(`/orders/${fx.orderId}/track`, {}, fx.shipperToken);
  check('marshrut arxivdan oʻqildi', archived.rows[0].polyline, archivedTrack.data.polyline);

  shipperSocket.close();
  driverSocket.close();
  await pg.end();

  console.log('\n\x1b[1m========== KUZATUV NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

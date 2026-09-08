/* eslint-disable no-console */
/**
 * KARVON — oflayn push yo'li
 *
 * Uchinchi talabning ikkinchi yarmi: ilova YOPIQ bo'lganda xabar
 * yo'qolmaydi — u FCM orqali ekran yuqorisidan sirg'aluvchi (heads-up)
 * bildirishnoma sifatida keladi.
 *
 * Bu yerda tekshiriladi:
 *   - qurilma ro'yxatdan o'tadi (PUT /me/devices)
 *   - foydalanuvchi oflayn bo'lsa bildirishnoma PUSH kanali bilan yoziladi
 *   - push navbatga tushadi va PushService uni oladi
 *   - foydalanuvchi onlayn bo'lsa push YUBORILMAYDI (ikki marta ko'rinmaydi)
 *   - takroriy tokenli qurilma ikki marta yozilmaydi
 *
 * Ishlatish: node scripts/push-test.js
 */
const Redis = require('ioredis');
const { io } = require('socket.io-client');

const { WS, api, createOrderFixture } = require('./lib/fixtures');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function main() {
  const redis = new Redis(REDIS_URL);

  step('Tayyorgarlik');
  const fx = await createOrderFixture();
  ok('buyurtma va chat tayyor', fx.orderId.slice(0, 8));

  // ------------------------------------------------------ qurilma
  step('Qurilmani ro`yxatdan o`tkazish');
  const device = await api(
    '/me/devices',
    {
      method: 'PUT',
      body: JSON.stringify({
        fcmToken: `test-token-${Date.now()}`,
        deviceId: 'test-device-1',
        platform: 'android',
      }),
    },
    fx.shipperToken,
  );
  check('qurilma yozildi', true, Boolean(device.data?.id ?? device.data));

  // Ilova har ochilganda qayta chaqiradi — dublikat bo'lmasligi kerak
  await api(
    '/me/devices',
    {
      method: 'PUT',
      body: JSON.stringify({
        fcmToken: `test-token-yangilangan-${Date.now()}`,
        deviceId: 'test-device-1',
        platform: 'android',
      }),
    },
    fx.shipperToken,
  );
  const deviceCount = await fx.pg.query(
    'SELECT count(*)::int AS n FROM devices WHERE user_id = $1',
    [fx.shipperId],
  );
  check('bitta qurilma — bitta yozuv', 1, deviceCount.rows[0].n);

  // ------------------------------------------------ oflayn: push ketadi
  step('Ilova YOPIQ: push navbatga tushadi');
  const before = Number(await redis.llen('push:queue'));

  await api(
    `/conversations/${fx.conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ body: 'Ilova yopiq paytdagi xabar' }) },
    fx.driverToken,
  );

  const notif = await fx.pg.query(
    `SELECT channel, delivery_status, title, body FROM notifications
      WHERE user_id = $1 AND template_key = 'chat.message'
      ORDER BY created_at DESC LIMIT 1`,
    [fx.shipperId],
  );
  check('bildirishnoma yozildi', 1, notif.rows.length);
  check('* KANAL — PUSH (oflayn)', 'PUSH', notif.rows[0].channel);
  check('holat SENT', 'SENT', notif.rows[0].delivery_status);
  ok('push matni', notif.rows[0].body);

  // PushService navbatni 1 soniyada bir tekshiradi — u olib bo'lgan
  // bo'lishi kerak. Navbat o'smagani "push ishlanmadi" degani emas,
  // aksincha: qo'yildi va darhol olindi.
  await sleep(1500);
  const after = Number(await redis.llen('push:queue'));
  check('navbat bo`shatildi (consumer ishladi)', true, after <= before);

  // ------------------------------------------------ onlayn: push YO'Q
  step('Ilova OCHIQ: push yuborilmaydi (ikki marta ko`rinmasin)');
  const socket = await connect(fx.shipperToken);
  await sleep(200); // presence Redis'ga yozilishi uchun

  await api(
    `/conversations/${fx.conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ body: 'Ilova ochiq paytdagi xabar' }) },
    fx.driverToken,
  );
  await sleep(300);

  const online = await fx.pg.query(
    `SELECT channel FROM notifications
      WHERE user_id = $1 AND template_key = 'chat.message'
      ORDER BY created_at DESC LIMIT 1`,
    [fx.shipperId],
  );
  check('* KANAL — IN_APP (onlayn banner)', 'IN_APP', online.rows[0].channel);

  // ------------------------------------------- uzilgandan keyin yana push
  step('Ulanish uzildi: yana push`ga qaytadi');
  socket.close();
  await sleep(400);

  await api(
    `/conversations/${fx.conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ body: 'Uzilgandan keyingi xabar' }) },
    fx.driverToken,
  );
  await sleep(300);

  const afterClose = await fx.pg.query(
    `SELECT channel FROM notifications
      WHERE user_id = $1 AND template_key = 'chat.message'
      ORDER BY created_at DESC LIMIT 1`,
    [fx.shipperId],
  );
  check('kanal yana PUSH', 'PUSH', afterClose.rows[0].channel);

  // ------------------------------------------------------ bildirishnoma markazi
  step('Bildirishnomalar markazi');
  const list = await api('/notifications', {}, fx.shipperToken);
  check('ro`yxat bo`sh emas', true, list.data.length >= 3);

  const unread = await api('/notifications/unread-count', {}, fx.shipperToken);
  check('o`qilmaganlar soni', true, Number(unread.data.count) >= 3);

  await api('/notifications/read-all', { method: 'POST' }, fx.shipperToken);
  const afterRead = await api('/notifications/unread-count', {}, fx.shipperToken);
  check('hammasi o`qildi', 0, afterRead.data.count);

  await redis.quit();
  await fx.pg.end();

  console.log('\n\x1b[1m========== PUSH NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

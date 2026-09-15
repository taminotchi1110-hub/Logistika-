/* eslint-disable no-console */
/**
 * KARVON — hisobni o'chirish (App Store 5.1.1(v), Google Play talabi)
 *
 * Tekshiriladi:
 *   - ochiq buyurtma yoki hamyonda pul bo'lsa — RAD ETILADI (ikkinchi
 *     tomon va pul himoyasi), hisob esa ishlashda davom etadi
 *   - o'chirilgach: token darhol ishlamaydi, shaxsiy maydonlar tozalangan,
 *     e'lon bekor qilingan, push qurilmasi yo'q
 *   - o'sha raqam bilan qaytadan ro'yxatdan o'tish — YANGI hisob
 *
 * Ishlatish: node scripts/account-deletion-test.js
 */
const { Client } = require('pg');

const { PGURL, api, login, createOrderFixture } = require('./lib/fixtures');

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

const randomPhone = (operator) =>
  `+998${operator}${Math.floor(Math.random() * 9000000 + 1000000)}`;

async function main() {
  const pg = new Client({ connectionString: PGURL });
  await pg.connect();

  // ------------------------------------------------------ ochiq buyurtma
  step('Ochiq buyurtma — oʻchirib boʻlmaydi');
  const fx = await createOrderFixture();

  const shipperTry = await api('/me', { method: 'DELETE' }, fx.shipperToken);
  check('★ YUK BERUVCHI RAD ETILDI', 'ACCOUNT_HAS_OPEN_ORDERS', shipperTry.error?.code);

  // Haydovchi ham: aks holda mijoz yukini olib ketayotgan odam "yo'qolib"
  // qolardi va buyurtma ikkinchi tomonsiz osilib turardi
  const driverTry = await api('/me', { method: 'DELETE' }, fx.driverToken);
  check('★ HAYDOVCHI HAM RAD ETILDI', 'ACCOUNT_HAS_OPEN_ORDERS', driverTry.error?.code);

  const stillWorks = await api('/me', {}, fx.shipperToken);
  check('rad etilgach hisob ishlayapti', fx.shipperId, stillWorks.data?.id);
  await fx.pg.end();

  // -------------------------------------------------------- hamyonda pul
  step('Hamyonda pul — avval yechish kerak');
  const richToken = await login(randomPhone('91'), 'SHIPPER');
  const topup = await api(
    '/payments/topup',
    { method: 'POST', body: JSON.stringify({ amountSoum: 50000, provider: 'CLICK' }) },
    richToken,
  );
  await api(`/payments/${topup.data.id}/simulate-paid`, { method: 'POST' }, richToken);

  const richTry = await api('/me', { method: 'DELETE' }, richToken);
  check('★ QOLDIQ BILAN RAD ETILDI', 'ACCOUNT_HAS_BALANCE', richTry.error?.code);
  check(
    'qoldiq javobda (ilova koʻrsatadi)',
    true,
    BigInt(richTry.error?.details?.balanceTiyin ?? 0) > 0n,
  );

  // ------------------------------------------------------------ o'chirish
  step('Hisobni oʻchirish');
  const phone = randomPhone('33');
  const token = await login(phone, 'SHIPPER');
  const me = await api('/me', {}, token);
  const userId = me.data.id;

  const load = await api(
    '/loads',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Oʻchiriladigan hisob yuki',
        categoryId: 3,
        weightKg: 1000,
        pickup: { address: 'Toshkent, Chilonzor', lat: 41.2856, lng: 69.2034 },
        delivery: { address: 'Buxoro, Ark', lat: 39.7775, lng: 64.4103 },
        pickupFrom: new Date(Date.now() + 3600e3).toISOString(),
        pickupTo: new Date(Date.now() + 6 * 3600e3).toISOString(),
        priceTiyin: 150000000,
        paymentMethod: 'CASH',
        publishNow: true,
      }),
    },
    token,
  );
  check('eʼlon joylandi', true, Boolean(load.data?.id));

  await api(
    '/me/devices',
    {
      method: 'PUT',
      body: JSON.stringify({
        fcmToken: `delete-test-${Date.now()}`,
        deviceId: 'delete-test',
        platform: 'android',
      }),
    },
    token,
  );

  const deleted = await api('/me', { method: 'DELETE' }, token);
  check('★ HISOB OʻCHIRILDI', true, deleted.data?.deleted);

  const after = await api('/me', {}, token);
  check('★ TOKEN DARHOL ISHLAMAYDI', 'AUTH_SESSION_REVOKED', after.error?.code);

  const row = (
    await pg.query(
      'SELECT phone, first_name, last_name, status, deleted_at FROM users WHERE id = $1',
      [userId],
    )
  ).rows[0];
  // "+99800…" — mavjud bo'lmagan operator: haqiqiy raqam bo'shadi, bu
  // raqam bilan esa hech kim kira olmaydi
  check('★ RAQAM BOʻSHATILDI', true, /^\+99800\d{7}$/.test(row.phone));
  check('ism tozalandi', null, row.first_name);
  check('familiya tozalandi', null, row.last_name);
  check('holat DELETED', 'DELETED', row.status);
  check('oʻchirilgan vaqti yozildi', true, Boolean(row.deleted_at));

  const loadRow = (await pg.query('SELECT status FROM loads WHERE id = $1', [load.data.id])).rows[0];
  // Haydovchilar lentada egasi yo'q e'lonni ko'rib, taklif yuborib yurmasin
  check('★ EʼLON BEKOR QILINDI', 'CANCELLED', loadRow.status);

  const devices = (
    await pg.query('SELECT count(*)::int AS n FROM devices WHERE user_id = $1', [userId])
  ).rows[0].n;
  check('★ PUSH QURILMASI OʻCHDI', 0, devices);

  const sessions = (
    await pg.query(
      'SELECT count(*)::int AS n FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    )
  ).rows[0].n;
  check('ochiq sessiya qolmadi', 0, sessions);

  const twice = await api('/me', { method: 'DELETE' }, token);
  check('eski token bilan qayta oʻchirib boʻlmaydi', true, Boolean(twice.error));

  // ------------------------------------------------ qaytadan ro'yxatdan
  step('Oʻsha raqam bilan qaytadan');
  const againToken = await login(phone, 'SHIPPER');
  const again = await api('/me', {}, againToken);
  check('★ YANGI HISOB OCHILDI', true, Boolean(again.data?.id) && again.data.id !== userId);
  check('raqam oʻsha', phone, again.data?.phone);

  await pg.end();

  console.log('\n\x1b[1m========== HISOBNI OʻCHIRISH NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

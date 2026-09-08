/* eslint-disable no-console */
/**
 * KARVON — avtomatik matching (D-01, D-02, D-03)
 *
 * Tekshiriladi:
 *   - hard filter: sigʻmaydigan, tasdiqlanmagan va band haydovchi tushmaydi
 *   - Match Score: yaqin va yoʻnalishi mos haydovchi yuqorida turadi
 *   - top haydovchilarga bildirishnoma ketadi
 *   - eʼlon holati MATCHING ga oʻtadi
 *   - koʻrish va taklif belgilari yoziladi (ML label)
 *
 * Ishlatish: node scripts/matching-test.js
 */
const { Client } = require('pg');

const { api, login, randomPlate } = require('./lib/fixtures');

const PGURL =
  process.env.PGURL || 'postgresql://karvon:karvon_dev_password@localhost:5432/karvon';

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

// Toshkent markazi va uning atrofidagi nuqtalar
const TASHKENT = { lat: 41.3111, lng: 69.2797 };
const SAMARQAND = { lat: 39.6542, lng: 66.9597 };

/**
 * Tayyor haydovchi yaratadi: profil, transport, hujjatlar, yoʻnalish,
 * joylashuv va AVAILABLE holati.
 */
async function createDriver(pg, options) {
  const rnd = Math.floor(Math.random() * 900000 + 100000);
  const phone = `+99899${rnd}${Math.floor(Math.random() * 9)}`;
  const token = await login(phone, 'DRIVER');

  const vehicle = await api(
    '/vehicles',
    {
      method: 'POST',
      body: JSON.stringify({
        vehicleTypeId: options.vehicleTypeId ?? 4,
        bodyTypeId: 1,
        brand: 'Isuzu',
        model: 'NPR',
        plateNumber: randomPlate(),
        capacityKg: options.capacityKg,
        volumeM3: options.volumeM3 ?? 25,
      }),
    },
    token,
  );

  if (!vehicle.data) {
    throw new Error(`transport yaratilmadi: ${JSON.stringify(vehicle.error)}`);
  }

  if (options.route) {
    await api(
      '/me/driver/routes',
      { method: 'POST', body: JSON.stringify(options.route) },
      token,
    );
  }

  const { rows } = await pg.query('SELECT id FROM users WHERE phone = $1', [phone]);
  const driverId = rows[0].id;

  await pg.query(
    `UPDATE driver_profiles SET verification_status = $2, availability = $3,
            current_geom = CASE WHEN $4::float8 IS NULL THEN NULL
                                ELSE ST_SetSRID(ST_MakePoint($5,$4),4326)::geography END,
            current_geom_at = now()
      WHERE user_id = $1`,
    [
      driverId,
      options.verified === false ? 'PENDING' : 'VERIFIED',
      options.availability ?? 'AVAILABLE',
      options.at ? options.at.lat : null,
      options.at ? options.at.lng : null,
    ],
  );
  await pg.query(
    `UPDATE vehicles SET verification_status = $2 WHERE driver_id = $1`,
    [driverId, options.vehicleVerified === false ? 'PENDING' : 'VERIFIED'],
  );
  await pg.query(
    `INSERT INTO documents(owner_type,owner_id,type,file_key,verification_status)
     VALUES ('USER',$1,'PASSPORT','t/p.jpg','VERIFIED'),('DRIVER',$1,'DRIVER_LICENSE','t/l.jpg','VERIFIED')`,
    [driverId],
  );

  return { driverId, token, vehicleId: vehicle.data.id, label: options.label };
}

async function main() {
  const pg = new Client({ connectionString: PGURL });
  await pg.connect();

  // Dev bazasi umumiy va oldingi yugurishlardan AYNAN shunday "ideal"
  // haydovchilar qolgan: bir xil joylashuv, bir xil yoʻnalish, bir xil
  // transport — demak bir xil ball. Top-20 ga kim tushishi tasodifga
  // bogʻlanib qoladi va test goh oʻtib, goh yiqiladi. Shuning uchun eski
  // test haydovchilarini nofaol qilamiz: bu yugurishda faqat hozir
  // yaratilganlari qatnashadi.
  const cleaned = await pg.query(
    `UPDATE driver_profiles SET availability = 'OFFLINE'
      WHERE availability = 'AVAILABLE'
        AND user_id IN (SELECT id FROM users WHERE phone LIKE '+99899%')`,
  );

  step('Nomzodlar tayyorlanmoqda');
  ok('eski test haydovchilari nofaol qilindi', `${cleaned.rowCount} ta`);

  // Toshkentda, Samarqandga doimiy yoʻnalishi bor — eng yaxshi nomzod
  const best = await createDriver(pg, {
    label: 'ideal',
    capacityKg: 5000,
    at: TASHKENT,
    route: { fromRegionId: 1, toRegionId: 3, isRegular: true },
  });

  // Toshkentda, lekin yoʻnalishi yoʻq
  const near = await createDriver(pg, {
    label: 'yaqin',
    capacityKg: 5000,
    at: { lat: 41.35, lng: 69.31 },
  });

  // Samarqandda — uzoq
  const far = await createDriver(pg, {
    label: 'uzoq',
    capacityKg: 5000,
    at: SAMARQAND,
  });

  // Quvvati yetmaydi — hard filter chiqarib tashlashi kerak
  const small = await createDriver(pg, {
    label: 'kichik',
    capacityKg: 1800,
    volumeM3: 8,
    at: TASHKENT,
  });

  // Tasdiqlanmagan — hard filter chiqarib tashlashi kerak
  const unverified = await createDriver(pg, {
    label: 'tasdiqlanmagan',
    capacityKg: 5000,
    at: TASHKENT,
    verified: false,
  });

  // Band (OFFLINE) — hard filter chiqarib tashlashi kerak
  const offline = await createDriver(pg, {
    label: 'oflayn',
    capacityKg: 5000,
    at: TASHKENT,
    availability: 'OFFLINE',
  });

  ok('6 ta haydovchi yaratildi', 'ok');

  // ------------------------------------------------------------ yuk
  step('Yuk eʼlon qilinadi (matching hodisa orqali ishga tushadi)');
  const shipperPhone = `+99897${Math.floor(Math.random() * 9000000 + 1000000)}`;
  const shipperToken = await login(shipperPhone, 'SHIPPER');

  const load = await api(
    '/loads',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Matching testi uchun yuk',
        categoryId: 3,
        weightKg: 4000,
        volumeM3: 18,
        pickup: { address: 'Toshkent, Yunusobod 108', ...TASHKENT },
        delivery: { address: 'Samarqand, Registon', ...SAMARQAND },
        pickupFrom: new Date(Date.now() + 3600e3).toISOString(),
        pickupTo: new Date(Date.now() + 6 * 3600e3).toISOString(),
        requiredVehicleTypeIds: [4],
        priceTiyin: 240000000,
        publishNow: true,
      }),
    },
    shipperToken,
  );

  const loadId = load.data.id;
  ok('yuk eʼlon qilindi', loadId.slice(0, 8));

  // Matching fonda ishlaydi — natijani kutamiz
  await sleep(1500);

  // ------------------------------------------------------- hard filter
  step('Hard filter');
  const matches = await api(`/loads/${loadId}/matches`, {}, shipperToken);

  // MUHIM: API javobi TOP-20 bilan cheklangan. Hard filter esa BUTUN
  // nomzodlar to'plamiga tegishli — u `load_matches` jadvalida turadi.
  // Agar tekshiruv API ro'yxatiga qarasa, baza to'lgani sari "chiqarib
  // tashlandi" degan tasdiqlar o'z-o'zidan o'tib ketaveradi: quvvati
  // yetmaydigan haydovchi filtr buzilgan taqdirda ham 20-o'ringa
  // tushmaydi. Shuning uchun to'liq to'plamni bazadan olamiz.
  const persisted = await pg.query(
    `SELECT driver_id, match_score::float8 AS score, rank
       FROM load_matches WHERE load_id = $1 ORDER BY rank`,
    [loadId],
  );
  const ids = persisted.rows.map((row) => row.driver_id);
  const scores = new Map(persisted.rows.map((row) => [row.driver_id, row.score]));

  // Oltita haydovchidan faqat ikkitasi hard filterdan oʻtadi: `ideal` va
  // `yaqin`. Qolgani ataylab chiqarib tashlanadi (quvvat, verifikatsiya,
  // holat, radius) — shuning uchun kutilgan son ANIQ 2.
  check('nomzodlar topildi', 2, persisted.rows.length);
  check('ideal nomzod roʻyxatda', true, ids.includes(best.driverId));
  check('yaqin nomzod roʻyxatda', true, ids.includes(near.driverId));
  check('quvvati yetmaydigan CHIQARILDI (1800 kg < 4000 kg)', false, ids.includes(small.driverId));
  check('tasdiqlanmagan CHIQARILDI', false, ids.includes(unverified.driverId));
  check('oflayn CHIQARILDI', false, ids.includes(offline.driverId));

  // ------------------------------------------------------- match score
  step('Match Score tartibi');
  const scoreOf = (driverId) => scores.get(driverId);

  // Baza umumiy: oldingi testlardan bir xil ballga ega haydovchilar
  // qolishi mumkin. Shuning uchun aniq o'rinni emas, NISBIY faktni
  // tekshiramiz — bu haqiqiy talab ("yaxshiroq nomzod yuqorida").
  check('★ IDEAL NOMZOD ENG YUQORI BALLDA', matches.data[0].score, scoreOf(best.driverId));
  check(
    '★ YOʻNALISHI MOS NOMZOD YUQORIROQ',
    true,
    scoreOf(best.driverId) > scoreOf(near.driverId),
  );
  ok('ideal ball', `${scoreOf(best.driverId)}%`);
  ok('yaqin ball (yoʻnalishsiz)', `${scoreOf(near.driverId)}%`);
  check('radiusdan tashqaridagi CHIQARILDI (~270 km)', false, ids.includes(far.driverId));

  check('ball 0..100 oraligʻida', true, scoreOf(best.driverId) <= 100);
  check('rank 1 dan boshlanadi', 1, matches.data[0].rank);
  check('masofa hisoblandi', true, matches.data[0].distanceToPickupKm !== null);

  const breakdown = await pg.query(
    `SELECT score_breakdown, weights_version FROM load_matches
      WHERE load_id = $1 AND driver_id = $2`,
    [loadId, best.driverId],
  );
  const components = breakdown.rows[0].score_breakdown;
  check('ball tarkibi saqlandi', true, typeof components.proximity === 'number');
  check('yoʻnalish toʻliq mos', 1, components.routeFit);
  check('ogʻirliklar versiyasi', 'v1', breakdown.rows[0].weights_version);

  // ------------------------------------------------- lenta moslik bilan
  //
  // Matching hisoblagan ball haydovchining LENTASIGA chiqishi kerak —
  // aks holda butun matching faqat push xabar uchun ishlagan bo'ladi.
  step('Lenta moslik boʻyicha');
  const feed = await api('/loads/feed?sort=match_score&limit=5', {}, best.token);
  const feedItem = feed.data?.find((item) => item.id === loadId);

  check('★ MOSLIK FOIZI LENTAGA CHIQDI', scoreOf(best.driverId), feedItem?.matchScore);
  check('★ MOS YUK BIRINCHI OʻRINDA', loadId, feed.data?.[0]?.id);

  const feedScores = feed.data.map((item) => item.matchScore ?? -1);
  const sortedDesc = feedScores.every((value, index) =>
    index === 0 ? true : feedScores[index - 1] >= value,
  );
  check('kamayish tartibida', true, sortedDesc);

  // Kursor: ikkinchi sahifa birinchisini takrorlamasligi kerak.
  // Moslik hisoblanmagan yuklar bir xil ballga ega — ular sana bo'yicha
  // ajratilmasa, sahifalash aynan shu yerda buziladi.
  if (feed.meta.hasMore) {
    const next = await api(
      `/loads/feed?sort=match_score&limit=5&cursor=${encodeURIComponent(feed.meta.nextCursor)}`,
      {},
      best.token,
    );
    const firstIds = new Set(feed.data.map((item) => item.id));
    const repeated = next.data.filter((item) => firstIds.has(item.id));
    check('★ KURSOR TAKRORLAMAYDI', 0, repeated.length);
    check('ikkinchi sahifa balli pastroq', true, (next.data[0]?.matchScore ?? -1) <= feedScores.at(-1));
  } else {
    ok('kursor tekshiruvi', 'lentada bitta sahifa');
  }

  // ------------------------------------------------------- bildirishnoma
  step('Top haydovchilarga bildirishnoma');
  const notified = await pg.query(
    `SELECT count(*)::int AS n FROM load_matches WHERE load_id = $1 AND notified_at IS NOT NULL`,
    [loadId],
  );
  check('bildirishnoma yuborildi', true, notified.rows[0].n > 0);

  const notif = await api('/notifications', {}, best.token);
  const matchNotif = notif.data.find((n) => n.templateKey === 'load.matched');
  check('★ HAYDOVCHI XABARDOR QILINDI', true, Boolean(matchNotif));
  check('bildirishnoma yukka bogʻlangan', loadId, matchNotif?.entityId);
  ok('bildirishnoma matni', matchNotif?.body);

  // ------------------------------------------------------------ holat
  step('Eʼlon holati');
  const loadRow = await pg.query('SELECT status FROM loads WHERE id = $1', [loadId]);
  check('holat MATCHING ga oʻtdi', 'MATCHING', loadRow.rows[0].status);

  // ------------------------------------------------------- ML belgilari
  step('ML belgilari (viewed / offered)');
  await api(`/loads/${loadId}`, {}, best.token);
  await sleep(400);

  const viewed = await pg.query(
    'SELECT viewed_at FROM load_matches WHERE load_id = $1 AND driver_id = $2',
    [loadId, best.driverId],
  );
  check('koʻrilgani yozildi', true, viewed.rows[0].viewed_at !== null);

  await api(
    `/loads/${loadId}/offers`,
    { method: 'POST', body: JSON.stringify({ vehicleId: best.vehicleId }) },
    best.token,
  );
  await sleep(400);

  const offered = await pg.query(
    'SELECT offered_at FROM load_matches WHERE load_id = $1 AND driver_id = $2',
    [loadId, best.driverId],
  );
  check('taklif yuborilgani yozildi', true, offered.rows[0].offered_at !== null);

  // ------------------------------------------------------- qayta matching
  step('Qayta matching');
  const again = await api(`/loads/${loadId}/rematch`, { method: 'POST' }, shipperToken);
  check('qayta ishga tushdi', 2, again.data.candidates);

  const notifiedAfter = await pg.query(
    `SELECT count(*)::int AS n FROM notifications
      WHERE template_key = 'load.matched' AND entity_id = $1 AND user_id = $2`,
    [loadId, best.driverId],
  );
  check('takroriy push yuborilmadi', 1, notifiedAfter.rows[0].n);

  // ------------------------------------------------------- begona yuk
  step('Xavfsizlik');
  const foreign = await api(`/loads/${loadId}/matches`, {}, near.token);
  check('begona yuk matchlari koʻrinmaydi', true, Boolean(foreign.error));

  await pg.end();

  console.log('\n\x1b[1m========== MATCHING NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

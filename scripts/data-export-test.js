/* eslint-disable no-console */
/**
 * KARVON — "ma'lumotlarimning nusxasi" (maxfiylik siyosati, 7-bo'lim)
 *
 * Tekshiriladi:
 *   - eksportda foydalanuvchining O'Z ma'lumoti to'liq bor (profil,
 *     transport, e'lon, buyurtma, yozishma, hujjat, kirish tarixi)
 *   - eksport SIR CHIQARMAYDI: refresh token, push tokeni, kuzatuv kaliti,
 *     shifrlangan pasport raqami, karta tokeni — hech qaysisi tushmaydi
 *   - ikkinchi tomonning to'liq telefon raqami YO'Q (maskalangan) — aks
 *     holda eksport "raqamni buyurtmagacha ko'rsatmaslik" qoidasini
 *     chetlab o'tishning yo'li bo'lib qolardi
 *   - tokensiz — 401, soatiga 5 martadan keyin — 429
 *
 * Ishlatish: node scripts/data-export-test.js
 */
const { API, api, login, createOrderFixture } = require('./lib/fixtures');

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

/** Status kerak bo'lganda (401/429) — `api()` faqat tanani qaytaradi. */
async function raw(path, token) {
  const response = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function main() {
  step('Tayyorgarlik: buyurtma, yozishma, hujjatlar');
  const fx = await createOrderFixture();

  // Shifrlangan maydon — eksport uni QIYMATSIZ ko'rsatishi kerak
  await fx.pg.query(`UPDATE users SET passport_number_enc = $1 WHERE id = $2`, [
    Buffer.from('AA1234567-maxfiy'),
    fx.driverId,
  ]);

  await api(
    `/conversations/${fx.conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ body: 'Eksport testi uchun xabar' }) },
    fx.shipperToken,
  );

  const fcmToken = `fcm-${Math.random().toString(36).slice(2)}-eksportda-boʻlmasin`;
  await api(
    '/me/devices',
    {
      method: 'PUT',
      body: JSON.stringify({ fcmToken, deviceId: 'export-test-device', platform: 'android' }),
    },
    fx.driverToken,
  );

  // ------------------------------------------------------------ to'liqlik
  step('Haydovchi eksporti — toʻliqlik');
  const driver = (await api('/me/export', {}, fx.driverToken)).data;

  check('format', 'karvon-export-v1', driver?.meta?.format);
  check('oʻz raqami toʻliq', fx.driverPhone, driver.profile.phone);
  check('transport', true, driver.vehicles.count >= 1);
  check('yoʻnalishlar', true, driver.driverRoutes.count >= 1);
  check('hujjatlar (pasport + guvohnoma)', true, driver.documents.count >= 2);
  check('takliflar', true, driver.offers.count >= 1);
  check('buyurtmalar', true, driver.orders.count >= 1);
  check('buyurtmadagi rolim', 'DRIVER', driver.orders.items[0].myRole);
  check('haydovchi profili bor', true, driver.driverProfile !== null);
  check('sessiyalar', true, driver.security.sessions.count >= 1);
  check('kirish tarixi', true, driver.security.loginHistory.count >= 1);
  check('qurilmalar', 1, driver.security.devices.count);

  const conversation = driver.conversations.items[0];
  check('suhbat', true, Boolean(conversation));
  check('suhbatdagi xabar', true, conversation.messages.length >= 1);
  check('xabar matni bor', 'Eksport testi uchun xabar', conversation.messages[0].body);
  check('begona xabar "mine" emas', false, conversation.messages[0].mine);

  const document = driver.documents.items.find((item) => item.type === 'DRIVER_LICENSE');
  check('hujjat turi', 'DRIVER_LICENSE', document?.type);
  check('yuklab olish havolasi', true, String(document?.downloadUrl).startsWith('http'));

  check('shifrlangan pasport belgisi', true, driver.encryptedFields.passportNumber);
  check('shifrlangan PINFL belgisi', false, driver.encryptedFields.pinfl);

  // ------------------------------------------------------------ maxfiylik
  step('Eksport sir chiqarmaydi');
  const dump = JSON.stringify(driver);

  check('★ IKKINCHI TOMON RAQAMI YOʻQ', false, dump.includes(fx.shipperPhone));
  check('maskalangan raqam bor', true, driver.orders.items[0].counterpart.phone.includes('***'));
  check('ikkinchi tomon ismi bor', true, Boolean(driver.orders.items[0].counterpart.firstName));
  check('★ PUSH TOKENI YOʻQ', false, dump.includes(fcmToken));
  check('★ SHIFRLANGAN PASPORT QIYMATI YOʻQ', false, dump.includes('AA1234567'));

  for (const secret of [
    'refreshTokenHash',
    'fcmToken',
    'trackingToken',
    'passportNumberEnc',
    'pinflEnc',
    'licenseNumberEnc',
    'cardToken',
    'fileKey',
    'attachmentKey',
    'rawCallback',
  ]) {
    check(`maydon yoʻq: ${secret}`, false, dump.includes(`"${secret}"`));
  }

  // ------------------------------------------------- faqat oʻz maʼlumoti
  step('Har kim faqat oʻzinikini oladi');
  const shipper = (await api('/me/export', {}, fx.shipperToken)).data;

  check('mijozda eʼlon bor', true, shipper.loads.count >= 1);
  check('mijozda transport yoʻq', 0, shipper.vehicles.count);
  check('mijozda haydovchi profili yoʻq', null, shipper.driverProfile);
  check(
    'mijoz eksportida haydovchi raqami yoʻq',
    false,
    JSON.stringify(shipper).includes(fx.driverPhone),
  );
  check('buyurtmadagi rolim', 'SHIPPER', shipper.orders.items[0].myRole);
  check('oʻz raqami toʻliq', fx.shipperPhone, shipper.profile.phone);

  await fx.pg.end();

  // ---------------------------------------------------------------- himoya
  step('Kirish himoyasi va limit');
  const anonymous = await raw('/me/export');
  check('tokensiz — 401', 401, anonymous.status);

  const phone = `+99890${Math.floor(Math.random() * 9000000 + 1000000)}`;
  const token = await login(phone, 'SHIPPER');

  let limited = 0;
  for (let attempt = 1; attempt <= 7; attempt++) {
    const response = await raw('/me/export', token);
    if (response.status === 429) limited++;
  }
  // 5 ta o'tadi, qolgani 429: eksport o'nlab jadvalni o'qiydi va uni
  // tsiklda chaqirish bazani bo'g'ish yo'li bo'lib qolmasligi kerak
  check('★ SOATIGA 5 TADAN KEYIN 429', 2, limited);

  console.log(`\n\x1b[1m${pass} ta oʻtdi, ${fail} ta yiqildi\x1b[0m`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\x1b[31mXATO:\x1b[0m', error);
  process.exit(1);
});

/* eslint-disable no-console */
/**
 * KARVON — xavfsizlik
 *
 * Har bir tekshiruv "hujumchi nima QILA OLMASLIGI kerak" ko'rinishida:
 *   - token qalbakilash: `alg: none`, RS256 → HS256 almashtirish,
 *     payload'ni o'zgartirish (boshqa foydalanuvchi nomidan)
 *   - o'g'irlangan refresh token: qayta ishlatilsa BARCHA sessiyalar yopiladi
 *   - begona resurslar (IDOR): buyurtma, chat, e'lon, taklif, transport,
 *     to'lov — nafaqat xato qaytadi, balki bazada HECH NARSA O'ZGARMAYDI
 *   - mass-assignment: rol, holat, reyting profil orqali o'zgarmaydi
 *   - sarlavhalar va CORS, xato javoblarida ichki tafsilot yo'q
 *
 * Ishlatish: node scripts/security-test.js
 */
const crypto = require('node:crypto');

const { API, createOrderFixture } = require('./lib/fixtures');

const ROOT = API.replace(/\/v1\/?$/, '');

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

const b64url = (value) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/**
 * `fixtures.api()` javob tanasini JSON deb o'qiydi — bu yerda bo'sh tanali
 * javoblar (204) va sarlavhalar ham kerak.
 */
async function raw(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, headers: response.headers, body };
}

async function call(path, options = {}, token) {
  const { status, body } = await raw(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return { status, data: body?.data, error: body?.error };
}

/** Kirish — access VA refresh token bilan. */
async function session(phone, role = 'SHIPPER') {
  const otp = await call('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
  if (!otp.data) throw new Error(`OTP olinmadi (${otp.error?.code})`);
  const verified = await call('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code: otp.data.devCode }),
  });
  if (!verified.data) throw new Error(`Kirish amalga oshmadi (${verified.error?.code})`);
  const { accessToken, refreshToken } = verified.data;
  await call(
    '/auth/profile',
    { method: 'POST', body: JSON.stringify({ firstName: 'Xavfsizlik', lastName: 'Test', role }) },
    accessToken,
  );
  return { accessToken, refreshToken };
}

const refresh = (refreshToken) =>
  call('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });

async function main() {
  const fx = await createOrderFixture();

  // ------------------------------------------------------------ tokenlar
  step('Token qalbakilash');
  const attacker = await session(randomPhone('90'));
  const [headerPart, payloadPart, signaturePart] = attacker.accessToken.split('.');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
  check('haqiqiy token RS256 bilan imzolangan', 'RS256', header.alg);

  const noneToken = `${b64url({ alg: 'none', typ: 'JWT' })}.${payloadPart}.`;
  check('★ alg=none (IMZOSIZ) TOKEN RAD ETILDI', 'AUTH_TOKEN_INVALID', (await call('/me', {}, noneToken)).error?.code);

  // Algoritm almashtirish: server HS256 ga "ko'nsa", ochiq kalit bilan
  // imzolangan token o'tib ketardi. Algoritm RS256 ga qat'iy bog'langan
  const hsHeader = b64url({ alg: 'HS256', typ: 'JWT' });
  const hsSignature = crypto
    .createHmac('sha256', 'karvon')
    .update(`${hsHeader}.${payloadPart}`)
    .digest('base64url');
  check(
    '★ HS256 GA ALMASHTIRILGAN TOKEN RAD ETILDI',
    'AUTH_TOKEN_INVALID',
    (await call('/me', {}, `${hsHeader}.${payloadPart}.${hsSignature}`)).error?.code,
  );

  // Boshqa foydalanuvchi nomidan: payload o'zgartirildi, imzo eskisi
  const forged = `${headerPart}.${b64url({ ...payload, sub: fx.shipperId })}.${signaturePart}`;
  check('★ PAYLOAD OʻZGARTIRILGAN TOKEN RAD ETILDI', 'AUTH_TOKEN_INVALID', (await call('/me', {}, forged)).error?.code);

  const noScheme = await raw(`${API}/me`, { headers: { Authorization: attacker.accessToken } });
  check('"Bearer" soʻzisiz token qabul qilinmaydi', 401, noScheme.status);

  // --------------------------------------------------- refresh o'g'irlanishi
  step('Oʻgʻirlangan refresh token');
  const victim = await session(randomPhone('91'));
  const rotated = await refresh(victim.refreshToken);
  check('refresh ishladi (yangi juftlik)', true, Boolean(rotated.data?.refreshToken));

  // Eski token ikkinchi marta keldi — demak nusxasi kimdadir bor
  const reused = await refresh(victim.refreshToken);
  check('★ ESKI REFRESH TOKEN QAYTA ISHLATILDI — ANIQLANDI', 'AUTH_REFRESH_REUSED', reused.error?.code);

  const afterReuse = await refresh(rotated.data.refreshToken);
  check('★ YANGI REFRESH TOKEN HAM YOPILDI (hujumchi ham)', 401, afterReuse.status);
  check(
    '★ ACCESS TOKEN HAM DARHOL KUCHSIZLANDI',
    'AUTH_SESSION_REVOKED',
    (await call('/me', {}, rotated.data.accessToken)).error?.code,
  );

  const loggedOut = await session(randomPhone('93'));
  await call('/auth/logout', { method: 'POST' }, loggedOut.accessToken);
  check(
    '★ CHIQQANDAN KEYIN TOKEN ISHLAMAYDI',
    'AUTH_SESSION_REVOKED',
    (await call('/me', {}, loggedOut.accessToken)).error?.code,
  );

  // --------------------------------------------------------------- IDOR
  step('Begona resurslar (IDOR)');
  // Rol "ikkalasi": rad etish ROL tufayli emas, EGALIK tufayli bo'lishi kerak
  const stranger = await session(randomPhone('94'), 'BOTH');
  const strangerId = (await call('/me', {}, stranger.accessToken)).data.id;

  const reads = [
    ['buyurtma tafsiloti', `/orders/${fx.orderId}`],
    ['buyurtma tarixi', `/orders/${fx.orderId}/history`],
    ['haydovchi joylashuvi', `/orders/${fx.orderId}/location`],
    ['reys marshruti', `/orders/${fx.orderId}/track`],
    ['buyurtma toʻlovi', `/orders/${fx.orderId}/payment`],
    ['chat yozishmasi', `/conversations/${fx.conversationId}/messages`],
    ['eʼlonga kelgan takliflar', `/loads/${fx.loadId}/offers`],
    ['buyurtma baholari', `/orders/${fx.orderId}/ratings`],
  ];
  for (const [name, path] of reads) {
    const result = await call(path, {}, stranger.accessToken);
    check(`★ BEGONA OʻQIY OLMAYDI: ${name}`, true, result.status >= 400 && !result.data);
  }

  const writes = [
    ['holatni oʻzgartirish', `/orders/${fx.orderId}/status`, 'POST', { status: 'CANCELLED_BY_SHIPPER', note: 'Begona bekor qilmoqchi' }],
    ['kontaktlarni ochish', `/orders/${fx.orderId}/reveal-contacts`, 'POST', { reason: 'Begona raqamni olmoqchi' }],
    ['chatga yozish', `/conversations/${fx.conversationId}/messages`, 'POST', { body: 'Begona xabar' }],
    ['eʼlonni tahrirlash', `/loads/${fx.loadId}`, 'PATCH', { title: 'Buzilgan eʼlon' }],
    ['eʼlonni bekor qilish', `/loads/${fx.loadId}/cancel`, 'POST', { reason: 'Begona bekor qilmoqchi' }],
    ['taklifni qaytarib olish', `/offers/${fx.offerId}/withdraw`, 'POST', undefined],
    ['transportni tahrirlash', `/vehicles/${fx.vehicleId}`, 'PATCH', { color: 'qora' }],
    ['transportni oʻchirish', `/vehicles/${fx.vehicleId}`, 'DELETE', undefined],
    ['baho qoʻyish', `/orders/${fx.orderId}/rating`, 'POST', { score: 1 }],
  ];
  for (const [name, path, method, body] of writes) {
    const result = await call(
      path,
      { method, ...(body ? { body: JSON.stringify(body) } : {}) },
      stranger.accessToken,
    );
    // Validatsiya xatosi "himoya ishladi" degani EMAS — so'rov egalik
    // tekshiruvigacha yetib bormagan. Unda test tanasini tuzatish kerak
    const blocked = result.status >= 400 && result.error?.code !== 'VALIDATION_FAILED';
    check(
      `★ BEGONA OʻZGARTIRA OLMAYDI: ${name}`,
      true,
      blocked ? true : `${result.status} ${result.error?.code ?? 'MUVAFFAQIYAT'}`,
    );
  }

  // Asosiy dalil — BAZA: javob kodi yolg'on gapirishi mumkin, holat esa yo'q
  const { pg } = fx;
  const order = (await pg.query('SELECT status FROM orders WHERE id = $1', [fx.orderId])).rows[0];
  check('★ BUYURTMA HOLATI OʻZGARMADI', 'ASSIGNED', order.status);
  const load = (await pg.query('SELECT title, status FROM loads WHERE id = $1', [fx.loadId]))
    .rows[0];
  check('★ EʼLON OʻZGARMADI', 'Test yuk', load.title);
  check('★ EʼLON BEKOR QILINMADI', 'ASSIGNED', load.status);
  const offer = (await pg.query('SELECT status FROM order_offers WHERE id = $1', [fx.offerId]))
    .rows[0];
  check('taklif oʻzgarmadi', 'ACCEPTED', offer.status);
  const vehicle = (
    await pg.query('SELECT color, deleted_at FROM vehicles WHERE id = $1', [fx.vehicleId])
  ).rows[0];
  check('★ TRANSPORT JOYIDA', null, vehicle.deleted_at);
  check('transport rangi oʻzgarmadi', true, vehicle.color !== 'qora');
  const messages = (
    await pg.query('SELECT count(*)::int AS n FROM messages WHERE sender_id = $1', [strangerId])
  ).rows[0].n;
  check('★ BEGONA XABAR YOZILMADI', 0, messages);
  const ratings = (
    await pg.query('SELECT count(*)::int AS n FROM ratings WHERE rater_id = $1', [strangerId])
  ).rows[0].n;
  check('begona baho yozilmadi', 0, ratings);

  // ------------------------------------------------------ mass-assignment
  step('Mass-assignment');
  for (const [name, patch] of [
    ['rol', { role: 'DRIVER' }],
    ['holat', { status: 'ACTIVE' }],
    ['reyting', { ratingAvg: 5 }],
    ['telefon', { phone: '+998901112233' }],
  ]) {
    const result = await call(
      '/me',
      { method: 'PATCH', body: JSON.stringify(patch) },
      attacker.accessToken,
    );
    check(`★ PROFIL ORQALI ${name.toUpperCase()} OʻZGARMAYDI`, 'VALIDATION_FAILED', result.error?.code);
  }

  // --------------------------------------------------- sarlavhalar va CORS
  step('Sarlavhalar va CORS');
  const health = await raw(`${ROOT}/health`);
  check('X-Content-Type-Options: nosniff', 'nosniff', health.headers.get('x-content-type-options'));
  check('★ X-Powered-By YASHIRILGAN (texnologiya oshkor emas)', null, health.headers.get('x-powered-by'));
  check('Strict-Transport-Security bor', true, Boolean(health.headers.get('strict-transport-security')));
  check('X-Frame-Options bor', true, Boolean(health.headers.get('x-frame-options')));

  const preflight = await raw(`${API}/me`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
  });
  check(
    '★ BEGONA SAYTGA CORS RUXSATI YOʻQ',
    null,
    preflight.headers.get('access-control-allow-origin'),
  );

  // ------------------------------------------------------ xato javoblari
  step('Xato javoblari');
  const malformed = await raw(`${API}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"phone":',
  });
  check('buzilgan JSON — 400', 400, malformed.status);
  check(
    '★ XATODA ICHKI TAFSILOT (STACK) YOʻQ',
    false,
    /\bat \S+ \(|node_modules/.test(JSON.stringify(malformed.body)),
  );

  const unknown = await raw(`${API}/yoq-manzil-${Date.now()}`);
  check('nomaʼlum manzil — 404', 404, unknown.status);

  await pg.end();

  console.log('\n\x1b[1m========== XAVFSIZLIK NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

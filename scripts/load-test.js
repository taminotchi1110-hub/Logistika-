/**
 * KARVON — yuklama testi (k6: https://k6.io)
 *
 *   k6 run -e BASE_URL=https://api.staging.karvon.uz/v1 scripts/load-test.js
 *   k6 run -e BASE_URL=http://localhost:3000/v1 -e USERS=5 scripts/load-test.js
 *
 * DIQQAT — FAQAT STAGING (yoki shu test uchun ko'tarilgan muhit):
 *   1. Skript HAQIQIY foydalanuvchi yaratadi va e'lon joylaydi. Prod
 *      bazasida ishlatilsa, lenta soxta yuklar bilan to'ladi.
 *   2. Muhitda `OTP_EXPOSE_CODE_IN_DEV=true` bo'lishi shart (kod javobda
 *      qaytadi). Production'da bu sozlama bilan server umuman ishga
 *      tushmaydi — ya'ni skript prodga qarshi ishlay olmaydi.
 *   3. `HTTP_RATE_LIMIT_PER_MINUTE` ni vaqtincha oshiring. Aks holda test
 *      serverning quvvatini emas, LIMITNI o'lchaydi (429 javoblar).
 *
 * NIMA O'LCHANADI (mahsulot uchun eng muhim uch oqim):
 *   - lenta        — haydovchi yuk qidiradi (eng ko'p chaqiriladigan)
 *   - kuzatuv      — reysdagi GPS nuqtalari (eng ko'p YOZADIGAN)
 *   - e'lon        — mijoz yuk joylaydi (matching va push zanjirini qo'zg'aydi)
 *
 * Tozalash (test tugagach, staging bazasida):
 *   DELETE FROM loads WHERE title LIKE 'YUKLAMA TESTI%';
 *   -- test foydalanuvchilari: phone LIKE '+99890777%'
 */
import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000/v1';
const USERS = Number(__ENV.USERS || 10);

// Prod manzilini ataylab to'sib qo'yamiz: adashib ishga tushirish oson
if (/api\.karvon\.uz/.test(BASE)) {
  fail('Bu skript ishlab chiqarish serveriga qarshi ishlatilmaydi. Staging manzilini bering.');
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    feed: {
      executor: 'ramping-vus',
      exec: 'browseFeed',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
    tracking: {
      executor: 'constant-vus',
      exec: 'sendLocation',
      vus: 10,
      duration: '3m',
    },
    create_load: {
      // Daqiqasiga 6 ta e'lon — har biri matching va push zanjirini qo'zg'aydi
      executor: 'constant-arrival-rate',
      exec: 'createLoad',
      rate: 6,
      timeUnit: '1m',
      duration: '3m',
      preAllocatedVUs: 5,
    },
  },
  thresholds: {
    // Umumiy xatolik darajasi: 1% dan oshsa test yiqiladi
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:feed}': ['p(95)<500'],
    'http_req_duration{scenario:tracking}': ['p(95)<300'],
    // E'lon yaratish og'irroq: geo, narx taxmini va matching
    'http_req_duration{scenario:create_load}': ['p(95)<1500'],
  },
};

function randomPhone() {
  // `+99890777XXXX` — tozalashda shu prefiks bo'yicha topiladi
  return `+99890777${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

/** OTP orqali kirish va profilni yakunlash. */
function signUp(role) {
  const phone = randomPhone();

  const requested = http.post(`${BASE}/auth/otp/request`, JSON.stringify({ phone }), {
    headers: JSON_HEADERS,
  });
  const code = requested.json('data.devCode');
  if (!code) {
    fail(
      `OTP kodi javobda yo'q (${requested.status}). Muhitda OTP_EXPOSE_CODE_IN_DEV=true bo'lishi kerak.`,
    );
  }

  const verified = http.post(`${BASE}/auth/otp/verify`, JSON.stringify({ phone, code }), {
    headers: JSON_HEADERS,
  });
  const token = verified.json('data.accessToken');
  if (!token) fail(`Kirish amalga oshmadi (${verified.status})`);

  http.post(
    `${BASE}/auth/profile`,
    JSON.stringify({ firstName: 'Yuklama', lastName: 'Test', role }),
    { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } },
  );

  return token;
}

export function setup() {
  const drivers = [];
  const shippers = [];
  for (let i = 0; i < USERS; i++) {
    drivers.push(signUp('DRIVER'));
    shippers.push(signUp('SHIPPER'));
  }
  return { drivers, shippers };
}

const authHeaders = (token) => ({
  headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
});

const pick = (list) => list[(__VU - 1) % list.length];

export function browseFeed(data) {
  const token = pick(data.drivers);

  const feed = http.get(`${BASE}/loads/feed?limit=20`, {
    ...authHeaders(token),
    tags: { name: 'feed' },
  });
  check(feed, { 'lenta 200': (r) => r.status === 200 });

  // Haydovchi odatda bitta e'lonni ochib ko'radi
  const first = feed.json('data.0.id');
  if (first) {
    const detail = http.get(`${BASE}/loads/${first}`, {
      ...authHeaders(token),
      tags: { name: 'load_detail' },
    });
    check(detail, { 'eʼlon 200': (r) => r.status === 200 });
  }

  sleep(1);
}

export function sendLocation(data) {
  const token = pick(data.drivers);

  const response = http.post(
    `${BASE}/me/driver/location`,
    JSON.stringify({
      points: [
        {
          lat: 41.2 + Math.random() * 0.2,
          lng: 69.1 + Math.random() * 0.3,
          speedKmh: 40 + Math.random() * 40,
          accuracyM: 8,
          recordedAt: new Date().toISOString(),
        },
      ],
    }),
    { ...authHeaders(token), tags: { name: 'location' } },
  );
  check(response, { 'joylashuv qabul qilindi': (r) => r.status === 200 || r.status === 201 });

  // Ilova ham taxminan shu chastotada yuboradi
  sleep(5);
}

export function createLoad(data) {
  const token = pick(data.shippers);
  const hour = 3600 * 1000;

  const response = http.post(
    `${BASE}/loads`,
    JSON.stringify({
      title: `YUKLAMA TESTI ${Date.now()}`,
      categoryId: 3,
      weightKg: 1000 + Math.floor(Math.random() * 9000),
      pickup: { address: 'Toshkent, Yunusobod', lat: 41.3111, lng: 69.2797 },
      delivery: { address: 'Samarqand, Registon', lat: 39.6542, lng: 66.9597 },
      pickupFrom: new Date(Date.now() + hour).toISOString(),
      pickupTo: new Date(Date.now() + 6 * hour).toISOString(),
      priceTiyin: 200000000,
      paymentMethod: 'CASH',
      publishNow: true,
    }),
    { ...authHeaders(token), tags: { name: 'create_load' } },
  );
  check(response, { 'eʼlon yaratildi': (r) => r.status === 201 || r.status === 200 });
}

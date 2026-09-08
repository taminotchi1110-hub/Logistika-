/* eslint-disable no-console */
/**
 * Testlar uchun umumiy tayyorgarlik: foydalanuvchilar, tekshirilgan haydovchi,
 * yuk, taklif va qabul qilingan buyurtma (chat shu yerda ochiladi).
 *
 * ws-test.js va push-test.js ikkalasi ham shu moduldan foydalanadi — bir xil
 * kodni ikki joyda saqlamaslik uchun.
 */
const { Client } = require('pg');

const API = process.env.API || 'http://localhost:3000/v1';
const WS = process.env.WS || 'http://localhost:3000';
const PGURL =
  process.env.PGURL || 'postgresql://karvon:karvon_dev_password@localhost:5432/karvon';

async function api(path, options = {}, token) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return response.json();
}

async function login(phone, role) {
  const otp = await api('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
  const verified = await api('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code: otp.data.devCode }),
  });
  const token = verified.data.accessToken;
  await api(
    '/auth/profile',
    { method: 'POST', body: JSON.stringify({ firstName: 'Test', lastName: 'User', role }) },
    token,
  );
  return token;
}

/**
 * To'liq oqim: ikki foydalanuvchi → mashina → hujjatlar → yuk → taklif →
 * qabul. Natijada buyurtma ASSIGNED holatida va chat ochiq bo'ladi.
 */
async function createOrderFixture() {
  const rnd = Math.floor(Math.random() * 900000 + 100000);
  const shipperPhone = `+99897${rnd}1`;
  const driverPhone = `+99899${rnd}2`;

  const pg = new Client({ connectionString: PGURL });
  await pg.connect();

  const shipperToken = await login(shipperPhone, 'SHIPPER');
  const driverToken = await login(driverPhone, 'DRIVER');

  const vehicle = await api(
    '/vehicles',
    {
      method: 'POST',
      body: JSON.stringify({
        vehicleTypeId: 4,
        bodyTypeId: 1,
        brand: 'Isuzu',
        model: 'NPR',
        plateNumber: `01A${Math.floor(Math.random() * 900 + 100)}CD`,
        capacityKg: 5000,
        volumeM3: 25,
      }),
    },
    driverToken,
  );

  await api(
    '/me/driver/routes',
    { method: 'POST', body: JSON.stringify({ fromRegionId: 1, toRegionId: 3 }) },
    driverToken,
  );

  // Tekshiruv admin paneli orqali bo'ladi — testda to'g'ridan-to'g'ri bazada
  const driverRow = await pg.query('SELECT id FROM users WHERE phone = $1', [driverPhone]);
  const shipperRow = await pg.query('SELECT id FROM users WHERE phone = $1', [shipperPhone]);
  const driverId = driverRow.rows[0].id;
  const shipperId = shipperRow.rows[0].id;

  await pg.query(`UPDATE driver_profiles SET verification_status='VERIFIED' WHERE user_id=$1`, [
    driverId,
  ]);
  await pg.query(`UPDATE vehicles SET verification_status='VERIFIED' WHERE driver_id=$1`, [
    driverId,
  ]);
  await pg.query(
    `INSERT INTO documents(owner_type,owner_id,type,file_key,verification_status)
     VALUES ('USER',$1,'PASSPORT','t/p.jpg','VERIFIED'),('DRIVER',$1,'DRIVER_LICENSE','t/l.jpg','VERIFIED')`,
    [driverId],
  );

  const load = await api(
    '/loads',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test yuk',
        categoryId: 3,
        weightKg: 4000,
        pickup: { address: 'Toshkent, Yunusobod 108', lat: 41.3111, lng: 69.2797 },
        delivery: { address: 'Samarqand, Registon', lat: 39.6542, lng: 66.9597 },
        pickupFrom: new Date(Date.now() + 3600e3).toISOString(),
        pickupTo: new Date(Date.now() + 6 * 3600e3).toISOString(),
        priceTiyin: 200000000,
        publishNow: true,
      }),
    },
    shipperToken,
  );

  const offer = await api(
    `/loads/${load.data.id}/offers`,
    { method: 'POST', body: JSON.stringify({ vehicleId: vehicle.data.id }) },
    driverToken,
  );

  const order = await api(`/offers/${offer.data.id}/accept`, { method: 'POST' }, shipperToken);

  return {
    pg,
    shipperToken,
    driverToken,
    shipperId,
    driverId,
    shipperPhone,
    driverPhone,
    vehicleId: vehicle.data.id,
    loadId: load.data.id,
    orderId: order.data.id,
    conversationId: order.data.conversationId,
  };
}

module.exports = { API, WS, PGURL, api, login, createOrderFixture };

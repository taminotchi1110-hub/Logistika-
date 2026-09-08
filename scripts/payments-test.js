/* eslint-disable no-console */
/**
 * KARVON — hamyon, ledger, escrow va PSP webhook'lari
 *
 * Tekshiriladi:
 *   - ikki yozuvli hisob: pul yo'qolmaydi va paydo bo'lmaydi
 *   - Click webhook'i: imzo, summa, ikki bosqich, takroriy callback
 *   - Payme webhook'i: JSON-RPC, autentifikatsiya, to'liq tsikl
 *   - escrow: buyurtmada bloklash → yakunlashda taqsimlash
 *   - naqd: komissiya haydovchi hamyonidan, manfiy balans
 *   - bekor qilish va jarima
 *   - pul yechish
 *
 * Ishlatish: node scripts/payments-test.js
 */
const { createHash } = require('node:crypto');
const { Client } = require('pg');

const { API, api, login, createOrderFixture } = require('./lib/fixtures');

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

/** Webhook'lar autentifikatsiyasiz — to'g'ridan-to'g'ri POST. */
const post = async (path, body, headers = {}) => {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const CLICK_SECRET = process.env.CLICK_SECRET_KEY || 'test_click_secret';
const PAYME_KEY = process.env.PAYME_MERCHANT_KEY || 'test_payme_key';
const SERVICE_ID = '12345';

function clickSign(fields, action) {
  const parts = [
    fields.click_trans_id,
    SERVICE_ID,
    CLICK_SECRET,
    fields.merchant_trans_id,
    ...(action === 1 ? [fields.merchant_prepare_id ?? ''] : []),
    fields.amount,
    String(action),
    fields.sign_time,
  ];
  return createHash('md5').update(parts.join('')).digest('hex');
}

const clickBody = (paymentId, amountSoum, action, prepareId) => {
  const fields = {
    click_trans_id: String(Math.floor(Math.random() * 1e9)),
    service_id: SERVICE_ID,
    merchant_trans_id: paymentId,
    amount: amountSoum.toFixed(2),
    action: String(action),
    sign_time: '2026-09-08 12:00:00',
    ...(action === 1 ? { merchant_prepare_id: String(prepareId) } : {}),
  };
  return { ...fields, sign_string: clickSign(fields, action) };
};

const paymeAuth = { Authorization: `Basic ${Buffer.from(`Paycom:${PAYME_KEY}`).toString('base64')}` };

const paymeCall = (method, params, id = 1) =>
  post('/payments/webhook/payme', { jsonrpc: '2.0', id, method, params }, paymeAuth);

async function main() {
  const pg = new Client({ connectionString: PGURL });
  await pg.connect();

  // ------------------------------------------------------ hamyon
  step('Hamyon');
  const userPhone = `+99897${Math.floor(Math.random() * 9000000 + 1000000)}`;
  const token = await login(userPhone, 'SHIPPER');

  const empty = await api('/wallet', {}, token);
  check('yangi hamyon nol balansli', '0', empty.data.balanceTiyin);
  check('koʻrsatish formati', '0 soʻm', empty.data.formatted);

  // ------------------------------------------------------ Click
  step('Click webhook: imzo va ikki bosqich');
  const topup = await api(
    '/payments/topup',
    { method: 'POST', body: JSON.stringify({ amountSoum: 100000, provider: 'CLICK' }) },
    token,
  );
  const paymentId = topup.data.id;
  check('toʻlov yaratildi', 'CREATED', topup.data.status);
  check('summa tiyinda', '10000000', topup.data.amountTiyin);

  // Notoʻgʻri imzo
  const badSign = await post('/payments/webhook/click/prepare', {
    ...clickBody(paymentId, 100000, 0),
    sign_string: 'a'.repeat(32),
  });
  check('★ NOTOʻGʻRI IMZO RAD ETILDI', -1, badSign.body.error);
  check('HTTP 200 qaytadi (Click talabi)', 200, badSign.status);

  // Notoʻgʻri summa
  const badAmount = await post('/payments/webhook/click/prepare', clickBody(paymentId, 5, 0));
  check('★ NOTOʻGʻRI SUMMA RAD ETILDI', -2, badAmount.body.error);

  // Toʻgʻri Prepare
  const prepare = await post('/payments/webhook/click/prepare', clickBody(paymentId, 100000, 0));
  check('Prepare qabul qilindi', 0, prepare.body.error);
  const prepareId = prepare.body.merchant_prepare_id;
  check('merchant_prepare_id qaytdi', true, Boolean(prepareId));

  const balanceAfterPrepare = await api('/wallet', {}, token);
  check('★ PREPARE PUL QOʻSHMAYDI', '0', balanceAfterPrepare.data.balanceTiyin);

  // Complete
  const complete = await post(
    '/payments/webhook/click/complete',
    clickBody(paymentId, 100000, 1, prepareId),
  );
  check('Complete qabul qilindi', 0, complete.body.error);

  const afterTopup = await api('/wallet', {}, token);
  check('★ PUL HAMYONGA TUSHDI', '10000000', afterTopup.data.balanceTiyin);
  check('formatlangan', '100 000 soʻm', afterTopup.data.formatted);

  // Takroriy Complete
  const again = await post(
    '/payments/webhook/click/complete',
    clickBody(paymentId, 100000, 1, prepareId),
  );
  check('takroriy callback ALREADY_PAID', -4, again.body.error);

  const afterDuplicate = await api('/wallet', {}, token);
  check('★ PUL IKKI MARTA QOʻSHILMADI', '10000000', afterDuplicate.data.balanceTiyin);

  // ------------------------------------------------------ Payme
  step('Payme webhook: JSON-RPC toʻliq tsikl');
  const paymeTopup = await api(
    '/payments/topup',
    { method: 'POST', body: JSON.stringify({ amountSoum: 50000, provider: 'PAYME' }) },
    token,
  );
  const paymePaymentId = paymeTopup.data.id;

  const noAuth = await post('/payments/webhook/payme', {
    jsonrpc: '2.0',
    id: 1,
    method: 'CheckPerformTransaction',
    params: {},
  });
  check('★ AUTENTIFIKATSIYASIZ RAD ETILDI', -32504, noAuth.body.error.code);

  const checkPerform = await paymeCall('CheckPerformTransaction', {
    amount: 5_000_000,
    account: { payment_id: paymePaymentId },
  });
  check('CheckPerformTransaction ruxsat berdi', true, checkPerform.body.result.allow);

  const wrongAmount = await paymeCall('CheckPerformTransaction', {
    amount: 100,
    account: { payment_id: paymePaymentId },
  });
  check('notoʻgʻri summa rad etildi', -31001, wrongAmount.body.error.code);

  const notFound = await paymeCall('CheckPerformTransaction', {
    amount: 5_000_000,
    account: { payment_id: '00000000-0000-0000-0000-000000000000' },
  });
  check('mavjud boʻlmagan toʻlov', -31050, notFound.body.error.code);

  const paymeTxnId = `pm_${Date.now()}`;
  const created = await paymeCall('CreateTransaction', {
    id: paymeTxnId,
    time: Date.now(),
    amount: 5_000_000,
    account: { payment_id: paymePaymentId },
  });
  check('CreateTransaction holati', 1, created.body.result.state);

  // Takroriy CreateTransaction — bir xil javob
  const recreated = await paymeCall('CreateTransaction', {
    id: paymeTxnId,
    time: Date.now(),
    amount: 5_000_000,
    account: { payment_id: paymePaymentId },
  });
  check('takroriy CreateTransaction idempotent', 1, recreated.body.result.state);

  const performed = await paymeCall('PerformTransaction', { id: paymeTxnId });
  check('★ PerformTransaction bajarildi', 2, performed.body.result.state);

  const afterPayme = await api('/wallet', {}, token);
  check('★ PAYME PULI TUSHDI', '15000000', afterPayme.data.balanceTiyin);

  const performedAgain = await paymeCall('PerformTransaction', { id: paymeTxnId });
  check('takroriy Perform idempotent', 2, performedAgain.body.result.state);

  const afterPaymeDup = await api('/wallet', {}, token);
  check('★ PAYME PULI IKKI MARTA QOʻSHILMADI', '15000000', afterPaymeDup.data.balanceTiyin);

  const checkTxn = await paymeCall('CheckTransaction', { id: paymeTxnId });
  check('CheckTransaction holati', 2, checkTxn.body.result.state);
  check('perform_time yozilgan', true, checkTxn.body.result.perform_time > 0);

  const statement = await paymeCall('GetStatement', {
    from: Date.now() - 3600_000,
    to: Date.now() + 3600_000,
  });
  check('GetStatement roʻyxat qaytardi', true, statement.body.result.transactions.length >= 1);

  const unknownMethod = await paymeCall('SomeUnknownMethod', {});
  check('nomaʼlum metod', -32601, unknownMethod.body.error.code);

  // ------------------------------------------------ ledger butunligi
  step('Ledger butunligi');
  const entries = await pg.query(
    `SELECT transaction_id, SUM(amount_tiyin)::text AS total
       FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount_tiyin) <> 0`,
  );
  check('★ HAR BIR TRANZAKSIYA BALANSLANGAN', 0, entries.rows.length);

  const mismatch = await pg.query(
    `SELECT a.id FROM ledger_accounts a
       LEFT JOIN ledger_entries e ON e.account_id = a.id
      GROUP BY a.id, a.balance_tiyin
     HAVING a.balance_tiyin <> COALESCE(SUM(e.amount_tiyin), 0)`,
  );
  check('★ BALANSLAR YOZUVLARGA MOS', 0, mismatch.rows.length);

  // Append-only tekshiruvi
  let immutable = false;
  try {
    await pg.query('UPDATE ledger_entries SET amount_tiyin = 1 WHERE id = (SELECT min(id) FROM ledger_entries)');
  } catch (error) {
    immutable = String(error.message).includes('append-only');
  }
  check('★ YOZUVNI OʻZGARTIRIB BOʻLMAYDI', true, immutable);

  let undeletable = false;
  try {
    await pg.query('DELETE FROM ledger_entries WHERE id = (SELECT min(id) FROM ledger_entries)');
  } catch (error) {
    undeletable = String(error.message).includes('append-only');
  }
  check('★ YOZUVNI OʻCHIRIB BOʻLMAYDI', true, undeletable);

  const history = await api('/wallet/history', {}, token);
  check('hamyon tarixi', 2, history.data.length);
  check('yozuv turi', 'TOPUP', history.data[0].entryType);

  // ================================================== ESCROW oqimi
  step('ESCROW: mablagʻ yetmasa buyurtma tuzilmaydi');
  const poor = await createOrderFixture({ paymentMethod: 'ESCROW', allowFailure: true });
  check('★ BUYURTMA TUZILMADI', 'WALLET_INSUFFICIENT_FUNDS', poor.acceptError?.code);
  check('buyurtma yaratilmagan', null, poor.orderId);

  const poorLoad = await poor.pg.query('SELECT status FROM loads WHERE id = $1', [poor.loadId]);
  check('yuk yana takliflar qabul qiladi', 'OFFERS_RECEIVED', poorLoad.rows[0].status);

  const poorOffer = await poor.pg.query('SELECT status FROM order_offers WHERE id = $1', [
    poor.offerId,
  ]);
  check('★ TAKLIF PENDING GA QAYTDI', 'PENDING', poorOffer.rows[0].status);
  await poor.pg.end();

  step('ESCROW: toʻliq tsikl');
  // Mijoz avval hamyonini toʻldiradi, keyin taklif qabul qilinadi
  const escrowFx = await createOrderFixture({
    paymentMethod: 'ESCROW',
    priceTiyin: 20_000_000,
    beforeOffer: async ({ shipperToken }) => {
      const payment = await api(
        '/payments/topup',
        { method: 'POST', body: JSON.stringify({ amountSoum: 300_000, provider: 'CLICK' }) },
        shipperToken,
      );
      await api(`/payments/${payment.data.id}/simulate-paid`, { method: 'POST' }, shipperToken);
    },
  });

  const heldOrder = await escrowFx.pg.query(
    'SELECT payment_status, commission_tiyin, driver_payout_tiyin FROM orders WHERE id = $1',
    [escrowFx.orderId],
  );
  check('★ PUL BLOKLANDI', 'HELD', heldOrder.rows[0].payment_status);

  const shipperAfterHold = await api('/wallet', {}, escrowFx.shipperToken);
  check('mijoz hamyonidan yechildi', '10000000', shipperAfterHold.data.balanceTiyin);

  const escrowAccount = await escrowFx.pg.query(
    `SELECT balance_tiyin FROM ledger_accounts WHERE type = 'ESCROW' AND user_id IS NULL`,
  );
  check('escrow hisobida pul bor', true, BigInt(escrowAccount.rows[0].balance_tiyin) >= 20_000_000n);

  // Reysni yakunlaymiz
  for (const status of [
    'CONFIRMED',
    'EN_ROUTE_TO_PICKUP',
    'ARRIVED_AT_PICKUP',
    'LOADED',
    'IN_TRANSIT',
    'ARRIVED_AT_DELIVERY',
    'DELIVERED',
  ]) {
    await api(
      `/orders/${escrowFx.orderId}/status`,
      { method: 'POST', body: JSON.stringify({ status }) },
      escrowFx.driverToken,
    );
  }
  await api(
    `/orders/${escrowFx.orderId}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'COMPLETED' }) },
    escrowFx.shipperToken,
  );
  await sleep(900);

  const commission = BigInt(heldOrder.rows[0].commission_tiyin);
  const payout = BigInt(heldOrder.rows[0].driver_payout_tiyin);
  check('komissiya hisoblangan', true, commission > 0n);
  check('narx = komissiya + haydovchi ulushi', 20_000_000n, commission + payout);

  const driverWallet = await api('/wallet', {}, escrowFx.driverToken);
  check('★ HAYDOVCHIGA PUL OʻTDI', payout.toString(), driverWallet.data.balanceTiyin);

  const revenue = await escrowFx.pg.query(
    `SELECT balance_tiyin FROM ledger_accounts WHERE type = 'PLATFORM_REVENUE'`,
  );
  check('★ PLATFORMA KOMISSIYASI', true, BigInt(revenue.rows[0].balance_tiyin) >= commission);

  const paidOrder = await escrowFx.pg.query('SELECT payment_status FROM orders WHERE id = $1', [
    escrowFx.orderId,
  ]);
  check('buyurtma toʻlangan', 'PAID', paidOrder.rows[0].payment_status);

  // ------------------------------------------------------- yechish
  step('Pul yechish');
  // Balansda 192 000 soʻm bor — 5 mln soʻm soʻrash rad etilishi kerak
  const tooMuch = await api(
    '/payouts',
    { method: 'POST', body: JSON.stringify({ amountSoum: 5_000_000, cardNumber: '8600123456781234' }) },
    escrowFx.driverToken,
  );
  check('★ BALANSDAN KOʻP YECHIB BOʻLMAYDI', 'WALLET_INSUFFICIENT_FUNDS', tooMuch.error?.code);

  const badCard = await api(
    '/payouts',
    { method: 'POST', body: JSON.stringify({ amountSoum: 20_000, cardNumber: '123' }) },
    escrowFx.driverToken,
  );
  check('notoʻgʻri karta rad etildi', 'VALIDATION_FAILED', badCard.error?.code);

  const payoutRequest = await api(
    '/payouts',
    { method: 'POST', body: JSON.stringify({ amountSoum: 100_000, cardNumber: '8600123456781234' }) },
    escrowFx.driverToken,
  );
  check('★ YECHISH SOʻROVI YARATILDI', 'CREATED', payoutRequest.data?.status);
  check('★ KARTA MASKALANGAN', '8600 **** **** 1234', payoutRequest.data?.cardMask);

  const cardStored = await escrowFx.pg.query(
    'SELECT card_mask, card_token FROM payouts WHERE id = $1',
    [payoutRequest.data.id],
  );
  check('toʻliq karta raqami SAQLANMAGAN', null, cardStored.rows[0].card_token);

  const afterPayout = await api('/wallet', {}, escrowFx.driverToken);
  check('summa hamyondan yechildi', (payout - 10_000_000n).toString(), afterPayout.data.balanceTiyin);

  const secondRequest = await api(
    '/payouts',
    { method: 'POST', body: JSON.stringify({ amountSoum: 20_000, cardNumber: '8600123456781234' }) },
    escrowFx.driverToken,
  );
  check('ikkinchi soʻrov rad etildi', 'PAYOUT_ALREADY_PENDING', secondRequest.error?.code);

  await escrowFx.pg.end();

  // ================================================== NAQD oqimi
  step('NAQD: komissiya haydovchi hamyonidan');
  const cashFx = await createOrderFixture({ paymentMethod: 'CASH', priceTiyin: 20_000_000 });

  const beforeCash = await api('/wallet', {}, cashFx.driverToken);
  check('haydovchi hamyoni boʻsh', '0', beforeCash.data.balanceTiyin);

  for (const status of [
    'CONFIRMED',
    'EN_ROUTE_TO_PICKUP',
    'ARRIVED_AT_PICKUP',
    'LOADED',
    'IN_TRANSIT',
    'ARRIVED_AT_DELIVERY',
    'DELIVERED',
  ]) {
    await api(
      `/orders/${cashFx.orderId}/status`,
      { method: 'POST', body: JSON.stringify({ status }) },
      cashFx.driverToken,
    );
  }
  await api(
    `/orders/${cashFx.orderId}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'COMPLETED' }) },
    cashFx.shipperToken,
  );
  await sleep(900);

  const cashWallet = await api('/wallet', {}, cashFx.driverToken);
  const cashOrder = await cashFx.pg.query('SELECT commission_tiyin FROM orders WHERE id = $1', [
    cashFx.orderId,
  ]);
  const cashCommission = BigInt(cashOrder.rows[0].commission_tiyin);

  check(
    '★ KOMISSIYA YECHILDI (MANFIY BALANS)',
    (-cashCommission).toString(),
    cashWallet.data.balanceTiyin,
  );
  check('haydovchi hali buyurtma ola oladi', true, cashWallet.data.canTakeOrders);

  // Limitdan oshgan holatni simulyatsiya qilamiz.
  // BALANSNI emas, LIMITNI oʻzgartiramiz: balansni qoʻlda yozish ledger
  // butunligini buzardi (yozuvlar yigʻindisiga mos kelmay qolardi) va
  // keyingi tekshiruv yolgʻon xato bergan boʻlardi.
  await cashFx.pg.query(
    `UPDATE ledger_accounts SET credit_limit_tiyin = 100
      WHERE user_id = $1 AND type = 'USER_WALLET'`,
    [cashFx.driverId],
  );

  const blocked = await api('/wallet', {}, cashFx.driverToken);
  check('★ LIMITDAN OSHGANDA BLOKLANADI', false, blocked.data.canTakeOrders);
  check('qarz hisoblandi', true, BigInt(blocked.data.debtToPayTiyin) > 0n);

  // Eski yuk allaqachon band — yangi eʼlon kerak
  const newLoad = await api(
    '/loads',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Qarzdor haydovchi uchun test yuki',
        categoryId: 3,
        weightKg: 4000,
        pickup: { address: 'Toshkent, Yunusobod 108', lat: 41.3111, lng: 69.2797 },
        delivery: { address: 'Samarqand, Registon', lat: 39.6542, lng: 66.9597 },
        pickupFrom: new Date(Date.now() + 3600e3).toISOString(),
        pickupTo: new Date(Date.now() + 6 * 3600e3).toISOString(),
        priceTiyin: 20_000_000,
        publishNow: true,
      }),
    },
    cashFx.shipperToken,
  );

  const blockedOffer = await api(
    `/loads/${newLoad.data.id}/offers`,
    { method: 'POST', body: JSON.stringify({ vehicleId: cashFx.vehicleId }) },
    cashFx.driverToken,
  );
  check('★ QARZDOR TAKLIF YUBORA OLMAYDI', 'WALLET_INSUFFICIENT_FUNDS', blockedOffer.error?.code);

  await cashFx.pg.end();

  // ================================================== bekor qilish
  step('Bekor qilish va jarima');
  const cancelFx = await createOrderFixture({
    paymentMethod: 'ESCROW',
    priceTiyin: 20_000_000,
    beforeOffer: async ({ shipperToken }) => {
      const payment = await api(
        '/payments/topup',
        { method: 'POST', body: JSON.stringify({ amountSoum: 300_000, provider: 'CLICK' }) },
        shipperToken,
      );
      await api(`/payments/${payment.data.id}/simulate-paid`, { method: 'POST' }, shipperToken);
    },
  });

  // Reys boshlanadi, keyin mijoz bekor qiladi → jarima
  await api(
    `/orders/${cancelFx.orderId}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'CONFIRMED' }) },
    cancelFx.driverToken,
  );
  await api(
    `/orders/${cancelFx.orderId}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'EN_ROUTE_TO_PICKUP' }) },
    cancelFx.driverToken,
  );
  await api(
    `/orders/${cancelFx.orderId}/status`,
    // Reys boshlangandan keyin mijoz BIR TOMONLAMA bekor qila olmaydi
    // (state machine ruxsat bermaydi) — bu ataylab: haydovchi yoʻlda.
    // Shuning uchun bu yerda haydovchi bekor qiladi va jarimani u toʻlaydi.
    { method: 'POST', body: JSON.stringify({ status: 'CANCELLED_BY_DRIVER', note: 'test' }) },
    cancelFx.driverToken,
  );
  await sleep(900);

  const refunded = await cancelFx.pg.query('SELECT payment_status FROM orders WHERE id = $1', [
    cancelFx.orderId,
  ]);
  check('★ PUL QAYTARILDI', 'REFUNDED', refunded.rows[0].payment_status);

  // Haydovchi aybdor → jarima UNING hamyonidan yechiladi (manfiyga tushadi)
  const driverPenalty = await api('/wallet', {}, cancelFx.driverToken);
  check('★ JARIMA AYBDORDAN YECHILDI', '-2000000', driverPenalty.data.balanceTiyin);

  // 300 000 − 200 000 (bloklandi) + 200 000 (toʻliq qaytdi) + 20 000 (jarima)
  const shipperBack = await api('/wallet', {}, cancelFx.shipperToken);
  check('★ MIJOZGA TOʻLIQ QAYTDI + JARIMA', '32000000', shipperBack.data.balanceTiyin);

  await cancelFx.pg.end();

  // ------------------------------------------- yakuniy butunlik tekshiruvi
  step('Yakuniy ledger butunligi');
  const finalCheck = await pg.query(
    `SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount_tiyin) <> 0`,
  );
  check('★ BARCHA TRANZAKSIYALAR BALANSLANGAN', 0, finalCheck.rows.length);

  const finalMismatch = await pg.query(
    `SELECT a.id FROM ledger_accounts a
       LEFT JOIN ledger_entries e ON e.account_id = a.id
      GROUP BY a.id, a.balance_tiyin
     HAVING a.balance_tiyin <> COALESCE(SUM(e.amount_tiyin), 0)`,
  );
  check('★ BARCHA BALANSLAR MOS', 0, finalMismatch.rows.length);

  await pg.end();

  console.log('\n\x1b[1m========== TOʻLOV NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

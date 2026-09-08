/* eslint-disable no-console */
/**
 * KARVON — WebSocket tekshiruvi
 *
 * Ikkinchi va uchinchi talabni isbotlaydi:
 *   2. Buyurtma qabul qilingandan keyin muloqot platforma chatida
 *   3. Xabar ikkala tomonga darhol yetadi (ekran yuqorisidagi banner uchun
 *      `notification` hodisasi — ilova ochiq bo'lganda ko'rsatiladi)
 *
 * Ishlatish (API ishlab turgan bo'lishi kerak):
 *   node scripts/ws-test.js
 */
const { io } = require('socket.io-client');

const { WS, api, createOrderFixture } = require('./lib/fixtures');

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

/** Hodisani kutadi — kelmasa test yiqiladi, abadiy osilib qolmaydi. */
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
    socket.once('connected', (payload) => {
      clearTimeout(timer);
      resolve({ socket, payload });
    });
    socket.once('error', (payload) => {
      clearTimeout(timer);
      reject(new Error(payload?.code || 'ulanish rad etildi'));
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

async function main() {
  step('Tayyorgarlik: buyurtma va chat yaratish');
  const fx = await createOrderFixture();
  ok('buyurtma yaratildi', fx.orderId.slice(0, 8));
  check('chat yaratildi', true, Boolean(fx.conversationId));

  const { conversationId, shipperToken, driverToken } = fx;

  // ------------------------------------------------------------- ulanish
  step('WebSocket ulanish');
  const rejected = await connect('yaroqsiz.token.qiymat').then(
    () => null,
    (error) => error.message,
  );
  check('yaroqsiz token rad etildi', 'AUTH_TOKEN_INVALID', rejected);

  const shipper = await connect(shipperToken);
  const driver = await connect(driverToken);
  ok('yuk beruvchi ulandi', shipper.payload.userId.slice(0, 8));
  ok('haydovchi ulandi', driver.payload.userId.slice(0, 8));

  // Begona suhbatga kirishga urinish — mavjudligini ham oshkor qilmaymiz
  const foreign = await driver.socket.emitWithAck('chat:join', {
    conversationId: '00000000-0000-0000-0000-000000000000',
  });
  check('begona suhbat rad etildi', 'NOT_FOUND', foreign.error);

  const joinDriver = await driver.socket.emitWithAck('chat:join', { conversationId });
  const joinShipper = await shipper.socket.emitWithAck('chat:join', { conversationId });
  check('haydovchi chatga kirdi', true, joinDriver.ok);
  check('yozish mumkin (ASSIGNED)', true, joinDriver.canWrite);
  check('yuk beruvchi chatga kirdi', true, joinShipper.ok);

  // --------------------------------------------------------------- xabar
  step('Xabar: darhol yetib borishi va banner');
  const incoming = waitFor(shipper.socket, 'chat:message');
  const banner = waitFor(shipper.socket, 'notification');

  const sent = await driver.socket.emitWithAck('chat:message', {
    conversationId,
    body: 'Assalomu alaykum, 15:00 da yetib boraman',
    clientMsgId: 'tmp-1',
  });
  check('xabar yuborildi', true, sent.ok);
  check('clientMsgId qaytdi (optimistik UI)', 'tmp-1', sent.clientMsgId);

  const received = await incoming;
  check('* XABAR DARHOL YETIB BORDI', 'Assalomu alaykum, 15:00 da yetib boraman', received.body);
  // `isMine` ko'ruvchiga bog'liq — bitta broadcast payload'ida bo'lishi mumkin
  // emas, aks holda qabul qiluvchi xabarni chatning noto'g'ri tomonida ko'radi
  check('broadcastda isMine yoq', undefined, received.isMine);
  check('senderId haydovchi', driver.payload.userId, received.senderId);
  check('yuboruvchi ackida isMine=true', true, sent.message.isMine);

  const bannerPayload = await banner;
  check('* BANNER HODISASI KELDI', 'chat.message', bannerPayload.type);
  check('banner kanali (heads-up)', 'karvon_messages', bannerPayload.channel);
  check('yetkazish usuli — realtime', 'realtime', bannerPayload.delivery);
  ok('banner matni', bannerPayload.body);
  check('deep link bor', true, String(bannerPayload.deepLink).startsWith('karvon://'));

  const empty = await driver.socket.emitWithAck('chat:message', { conversationId, body: '   ' });
  check('bosh xabar rad etildi', 'CHAT_MESSAGE_EMPTY', empty.error);

  // --------------------------------------------------------------- o'qildi
  step('Oqildi belgisi va "yozmoqda"');
  const readEvent = waitFor(driver.socket, 'chat:read');
  await shipper.socket.emitWithAck('chat:read', { conversationId });
  const readPayload = await readEvent;
  check('oqildi belgisi yetib bordi', conversationId, readPayload.conversationId);

  const typingEvent = waitFor(driver.socket, 'chat:typing');
  shipper.socket.emit('chat:typing', { conversationId, isTyping: true });
  const typing = await typingEvent;
  check('"yozmoqda" yetib bordi', true, typing.isTyping);

  // ------------------------------------------------- buyurtma statusi banneri
  step('Buyurtma statusi ham banner beradi');
  const statusBanner = waitFor(shipper.socket, 'notification');
  await api(
    `/orders/${fx.orderId}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'CONFIRMED' }) },
    driverToken,
  );
  const statusPayload = await statusBanner;
  check('status banneri keldi', 'order.status', statusPayload.type);
  check('status kanali', 'karvon_orders', statusPayload.channel);

  // ------------------------------------------------------- REST zaxira yo'li
  step('REST zaxira yoli (WS ishlamagan holat)');
  const restMessage = await api(
    `/conversations/${conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ body: 'REST orqali xabar' }) },
    shipperToken,
  );
  check('REST orqali ham yuborildi', 'REST orqali xabar', restMessage.data.body);

  const history = await api(`/conversations/${conversationId}/messages`, {}, driverToken);
  check('tarixda ikkala xabar bor', 2, history.data.length);

  const conversations = await api('/conversations', {}, driverToken);
  check('suhbatlar royxati', 1, conversations.data.length);
  check('oqilmagan hisoblandi', 1, conversations.data[0].unreadCount);

  // ------------------------- bekor qilingan buyurtmada chat faqat o'qish uchun
  step('Bekor qilingan buyurtmada chat yopiladi');
  // Bekor qilish alohida endpoint emas — hammasi status mashinasi orqali
  const cancelled = await api(
    `/orders/${fx.orderId}/status`,
    {
      method: 'POST',
      body: JSON.stringify({
        status: 'CANCELLED_BY_SHIPPER',
        note: 'Test uchun bekor qilindi',
      }),
    },
    shipperToken,
  );
  check('buyurtma bekor qilindi', 'CANCELLED_BY_SHIPPER', cancelled.data.status);
  const afterCancel = await driver.socket.emitWithAck('chat:message', {
    conversationId,
    body: 'Endi yozib bolmasligi kerak',
  });
  check('bekor qilingandan keyin yozib bolmaydi', 'CHAT_CLOSED', afterCancel.error);

  const readOnly = await api(`/conversations/${conversationId}/messages`, {}, driverToken);
  check('tarix hali ham oqiladi (nizo uchun dalil)', 2, readOnly.data.length);

  shipper.socket.close();
  driver.socket.close();
  await fx.pg.end();

  console.log('\n\x1b[1m========== WEBSOCKET NATIJASI ==========\x1b[0m');
  console.log(`  O'tdi: \x1b[32m${pass}\x1b[0m    Yiqildi: \x1b[31m${fail}\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n\x1b[31mXATO:\x1b[0m', error.message);
  process.exit(1);
});

/* eslint-disable no-console */
/**
 * Tayyor buyurtma yaratadi va uni JSON qilib chiqaradi.
 *
 * NEGA ALOHIDA SKRIPT: mobil integratsiya testlari haydovchini
 * tasdiqlay olmaydi — buning uchun bazaga to'g'ridan-to'g'ri yozish
 * kerak (odatda buni admin qiladi). Test bu skriptni chaqiradi va
 * tayyor buyurtmadan boshlaydi.
 *
 * Faqat ishlab chiqish muhitida ishlatiladi.
 *
 *   node scripts/order-fixture.js
 *   → {"orderId":"…","shipperToken":"…","driverToken":"…"}
 */
const { createOrderFixture } = require('./lib/fixtures');

(async () => {
  const fx = await createOrderFixture();
  await fx.pg.end();

  // Faqat testga kerakli maydonlar — token va identifikatorlar
  console.log(
    JSON.stringify({
      orderId: fx.orderId,
      loadId: fx.loadId,
      conversationId: fx.conversationId,
      shipperToken: fx.shipperToken,
      driverToken: fx.driverToken,
      shipperPhone: fx.shipperPhone,
      driverPhone: fx.driverPhone,
    }),
  );
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

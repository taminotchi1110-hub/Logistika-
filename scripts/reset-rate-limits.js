/* eslint-disable no-console */
/**
 * FAQAT DEV UCHUN: OTP tezlik cheklovlarini tozalaydi.
 *
 * NEGA KERAK: bitta IP kuniga 50 ta OTP so'rashi mumkin (spam va SMS
 * xarajatiga qarshi himoya). Testlar har safar yangi foydalanuvchi
 * yaratgani uchun bu limit lokal mashinada tez tugaydi. Limitni
 * o'chirib qo'ymaymiz — testdan oldin hisoblagichni nolga qaytaramiz.
 *
 * Ishlab chiqarish muhitida ishga tushmasligi uchun tekshiruv bor.
 */
const Redis = require('ioredis');

const url = process.env.REDIS_URL || 'redis://localhost:6379';

if (process.env.NODE_ENV === 'production') {
  console.error('Bu skript ishlab chiqarish muhitida ishlamaydi');
  process.exit(1);
}

async function main() {
  const redis = new Redis(url);
  const keys = await redis.keys('rl:otp:*');

  if (keys.length > 0) {
    await redis.del(...keys);
  }

  console.log(`Tozalandi: ${keys.length} ta OTP limit kaliti`);
  await redis.quit();
}

main().catch((error) => {
  console.error('Xato:', error.message);
  process.exit(1);
});

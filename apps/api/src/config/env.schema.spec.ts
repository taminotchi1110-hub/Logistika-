import { envSchema } from './env.schema';

const BASE = {
  DATABASE_URL: 'postgresql://karvon:karvon@localhost:5432/karvon',
  REDIS_URL: 'redis://localhost:6379',
  OTP_PEPPER: 'test-pepper-kamida-16-belgi',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'karvon',
  S3_ACCESS_KEY: 'karvon',
  S3_SECRET_KEY: 'karvon_dev_password',
};

const REVIEW_PHONE = '+998901112233';

/** Xato bergan kalitlar (bo'sh ro'yxat — sozlama to'g'ri). */
function invalidKeys(extra: Record<string, string>): string[] {
  const result = envSchema.safeParse({ ...BASE, ...extra });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('envSchema — doʻkon koʻrib chiquvchilari uchun sinov hisobi', () => {
  it('ixtiyoriy: berilmasa yoki boʻsh boʻlsa xato yoʻq', () => {
    expect(invalidKeys({})).toEqual([]);
    expect(invalidKeys({ REVIEW_PHONE: '', REVIEW_OTP_CODE: '' })).toEqual([]);
  });

  it('toʻgʻri raqam va kod qabul qilinadi', () => {
    expect(invalidKeys({ REVIEW_PHONE, REVIEW_OTP_CODE: '739182' })).toEqual([]);
  });

  it('★ FAQAT BITTASI BERILSA — ILOVA ISHGA TUSHMAYDI', () => {
    expect(invalidKeys({ REVIEW_PHONE })).toContain('REVIEW_OTP_CODE');
    expect(invalidKeys({ REVIEW_OTP_CODE: '739182' })).toContain('REVIEW_OTP_CODE');
  });

  it.each([
    ['998901112233', '+ belgisisiz'],
    ['+998 90 111 22 33', 'boʻshliqlar bilan'],
    ['+998001112233', 'mavjud boʻlmagan operator kodi'],
  ])('raqam kanonik boʻlishi kerak: %s (%s)', (phone) => {
    // Soʻrovdagi raqam kanonik shaklga keltiriladi — boshqa shakldagi
    // sozlama hech qachon mos kelmasdi va sinov hisobi jimgina ishlamasdi
    expect(invalidKeys({ REVIEW_PHONE: phone, REVIEW_OTP_CODE: '739182' })).toContain(
      'REVIEW_PHONE',
    );
  });

  it('kod uzunligi OTP_LENGTH ga teng', () => {
    expect(invalidKeys({ REVIEW_PHONE, REVIEW_OTP_CODE: '73918' })).toContain('REVIEW_OTP_CODE');
    expect(invalidKeys({ REVIEW_PHONE, REVIEW_OTP_CODE: '73918', OTP_LENGTH: '5' })).toEqual([]);
  });

  it.each(['000000', '777777', '123456', '654321', '890123', '12a456'])(
    '★ ODDIY YOKI NOTOʻGʻRI KOD RAD ETILADI: %s',
    (code) => {
      expect(invalidKeys({ REVIEW_PHONE, REVIEW_OTP_CODE: code })).toContain('REVIEW_OTP_CODE');
    },
  );

  it('prodda ham ruxsat etiladi — doʻkonlar aynan prod serverni tekshiradi', () => {
    const keys = invalidKeys({ NODE_ENV: 'production', REVIEW_PHONE, REVIEW_OTP_CODE: '739182' });
    expect(keys.filter((key) => key.startsWith('REVIEW'))).toEqual([]);
  });
});

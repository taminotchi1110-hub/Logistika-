/**
 * Muhit o'zgaruvchilarini validatsiya qilish.
 *
 * NEGA ALOHIDA ZOD (DTO'lar esa class-validator'da):
 * Env — bu HTTP so'rov emas, dekoratorli sinf ham kerak emas. Zod bu yerda
 * bitta faylda tugaydigan, tiplarni avtomatik chiqaradigan eng qisqa yechim.
 * Ilova NOTO'G'RI KONFIGURATSIYA bilan umuman ishga tushmasligi kerak —
 * "keyin ma'lum bo'ladigan" xatolarning eng qimmati shu.
 */
import { z } from 'zod';

const durationRegex = /^\d+(ms|s|m|h|d)$/;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z.string().default('v1'),
    CORS_ORIGINS: z.string().default(''),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // --- baza ---
    DATABASE_URL: z.string().url(),
    DATABASE_REPLICA_URL: z.string().url().optional().or(z.literal('')),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),

    // --- redis ---
    REDIS_URL: z.string().url(),

    // --- jwt ---
    JWT_PRIVATE_KEY: z.string().optional().or(z.literal('')),
    JWT_PUBLIC_KEY: z.string().optional().or(z.literal('')),
    JWT_ISSUER: z.string().default('karvon.uz'),
    JWT_ACCESS_TTL: z.string().regex(durationRegex, 'masalan: 15m, 1h').default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    // --- otp ---
    OTP_PEPPER: z.string().min(16, "OTP_PEPPER kamida 16 belgi bo'lishi kerak"),
    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
    OTP_MAX_PER_HOUR_PER_PHONE: z.coerce.number().int().min(1).max(20).default(3),
    OTP_MAX_PER_DAY_PER_IP: z.coerce.number().int().min(1).max(200).default(10),
    OTP_EXPOSE_CODE_IN_DEV: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // --- sms ---
    SMS_PROVIDER: z.enum(['console', 'eskiz']).default('console'),
    SMS_SENDER_NAME: z.string().default('KARVON'),
    ESKIZ_BASE_URL: z.string().url().default('https://notify.eskiz.uz/api'),
    ESKIZ_EMAIL: z.string().optional().or(z.literal('')),
    ESKIZ_PASSWORD: z.string().optional().or(z.literal('')),

    // --- shifrlash ---
    FIELD_ENCRYPTION_KEY: z.string().optional().or(z.literal('')),

    // --- S3 / MinIO ---
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    S3_PUBLIC_URL: z.string().url().optional().or(z.literal('')),
    S3_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    S3_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    S3_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .default(20 * 1024 * 1024),

    // --- marshrut va geokoding ---
    OSRM_BASE_URL: z.string().url().optional().or(z.literal('')),
    GEOCODER_PROVIDER: z.enum(['nominatim', 'yandex']).default('nominatim'),
    NOMINATIM_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
    YANDEX_GEOCODER_API_KEY: z.string().optional().or(z.literal('')),
    GEO_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(8_000),

    // --- yuk e'lonlari ---
    LOAD_DEFAULT_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
    LOAD_MAX_ACTIVE_PER_SHIPPER: z.coerce.number().int().min(1).max(1000).default(20),
    LOAD_FEED_PAGE_SIZE: z.coerce.number().int().min(5).max(100).default(20),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';

    // Prodda vaqtinchalik generatsiya qilingan JWT kaliti mumkin emas:
    // har bir replika o'z kalitini yaratsa, tokenlar bir-birida ishlamaydi.
    if (isProd && (!env.JWT_PRIVATE_KEY || !env.JWT_PUBLIC_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_PRIVATE_KEY'],
        message: 'Production/staging uchun JWT_PRIVATE_KEY va JWT_PUBLIC_KEY majburiy (RS256).',
      });
    }
    if (isProd && env.SMS_PROVIDER === 'console') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_PROVIDER'],
        message: "Production muhitida SMS_PROVIDER=console bo'lishi mumkin emas.",
      });
    }
    if (isProd && env.OTP_EXPOSE_CODE_IN_DEV) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTP_EXPOSE_CODE_IN_DEV'],
        message: "OTP kodini javobda ochish production muhitida qat'iyan taqiqlanadi.",
      });
    }
    if (isProd && !env.FIELD_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIELD_ENCRYPTION_KEY'],
        message: 'Shaxsiy maydonlarni shifrlash kaliti production uchun majburiy.',
      });
    }
    if (env.SMS_PROVIDER === 'eskiz' && (!env.ESKIZ_EMAIL || !env.ESKIZ_PASSWORD)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ESKIZ_EMAIL'],
        message: 'SMS_PROVIDER=eskiz uchun ESKIZ_EMAIL va ESKIZ_PASSWORD kerak.',
      });
    }
    if (env.GEOCODER_PROVIDER === 'yandex' && !env.YANDEX_GEOCODER_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['YANDEX_GEOCODER_API_KEY'],
        message: 'GEOCODER_PROVIDER=yandex uchun API kalit kerak.',
      });
    }
    // Prodda masofa taxminan hisoblanishi mumkin emas: narx va ETA shunga bog'liq.
    if (isProd && !env.OSRM_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OSRM_BASE_URL'],
        message:
          'Production uchun OSRM majburiy — aks holda masofa taxminiy hisoblanadi va narx notoʼgri chiqadi.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** ConfigModule uchun validate funksiyasi — xato bo'lsa ilova ko'tarilmaydi. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(env)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Muhit o'zgaruvchilari noto'g'ri:\n${details}\n`);
  }
  return result.data;
}

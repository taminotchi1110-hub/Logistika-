import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { ErrorCode } from '@/common/errors/error-codes';
import type { RateLimitService } from '@/common/services/rate-limit.service';
import type { Env } from '@/config/env.schema';
import type { DatabaseService } from '@/infra/database/database.service';
import type { SmsService } from '@/modules/sms/sms.service';

import { OtpService } from './otp.service';

const PEPPER = 'test-pepper-kamida-16-belgi';
const REVIEW_PHONE = '+998901112233';
const REVIEW_CODE = '739182';
const PHONE = '+998901234567';

const hash = (phone: string, code: string) =>
  createHash('sha256').update(`${phone}:${code}:${PEPPER}`).digest('hex');

type Row = Record<string, unknown>;

/**
 * Kysely so'rov zanjirining soddalashtirilgan modeli: yozilgan qatorlarni
 * saqlaydi, `select` esa berilgan qatorni qaytaradi.
 */
function createDatabaseStub(selected?: Row) {
  const inserted: Row[] = [];
  const builder = (first?: Row, onValues?: (row: Row) => void) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['set', 'where', 'orderBy', 'selectAll', 'returning']) {
      chain[method] = () => chain;
    }
    chain.values = (row: Row) => {
      onValues?.(row);
      return chain;
    };
    chain.execute = async () => [];
    chain.executeTakeFirst = async () => first;
    return chain;
  };
  return {
    inserted,
    db: {
      updateTable: () => builder({ attempts: 1 }),
      insertInto: () => builder(undefined, (row) => inserted.push(row)),
      selectFrom: () => builder(selected),
    },
  };
}

function createService(options: { review?: boolean; cooldownFree?: boolean; selected?: Row } = {}) {
  const { review = true, cooldownFree = true, selected } = options;
  const values: Partial<Record<keyof Env, unknown>> = {
    NODE_ENV: 'production',
    OTP_LENGTH: 6,
    OTP_TTL_SECONDS: 300,
    OTP_MAX_ATTEMPTS: 5,
    OTP_RESEND_COOLDOWN_SECONDS: 60,
    OTP_MAX_PER_HOUR_PER_PHONE: 3,
    OTP_MAX_PER_DAY_PER_IP: 10,
    OTP_PEPPER: PEPPER,
    OTP_EXPOSE_CODE_IN_DEV: false,
    REVIEW_PHONE: review ? REVIEW_PHONE : '',
    REVIEW_OTP_CODE: review ? REVIEW_CODE : '',
  };
  const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
  const database = createDatabaseStub(selected);
  const sms = { sendOtp: jest.fn(async (_phone: string, _code: string, _lang: string) => {}) };
  const rateLimit = {
    acquireCooldown: jest.fn(async () =>
      cooldownFree ? { acquired: true } : { acquired: false, retryAfterSeconds: 42 },
    ),
    consume: jest.fn(async () => ({ allowed: true, current: 1, retryAfterSeconds: 0 })),
    releaseCooldown: jest.fn(async () => {}),
  };
  const service = new OtpService(
    database as unknown as DatabaseService,
    sms as unknown as SmsService,
    rateLimit as unknown as RateLimitService,
    config,
  );
  return { service, database, sms };
}

/** Amaldagi, muddati tugamagan kod qatori. */
const activeOtp = (codeHash: string): Row => ({
  id: 'otp-1',
  codeHash,
  attempts: 0,
  expiresAt: new Date(Date.now() + 60_000),
});

describe('OtpService — doʻkon koʻrib chiquvchilari uchun sinov hisobi', () => {
  it('★ SINOV RAQAMIGA SMS YUBORILMAYDI, KOD DOIMIY', async () => {
    const { service, database, sms } = createService();

    const result = await service.request(REVIEW_PHONE, '10.0.0.1');

    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(database.inserted).toHaveLength(1);
    expect(database.inserted[0]?.codeHash).toBe(hash(REVIEW_PHONE, REVIEW_CODE));
    // Prodda kod javobda HECH QACHON qaytmaydi — sinov hisobida ham
    expect(result.devCode).toBeUndefined();
  });

  it('★ DOIMIY KOD BILAN KIRISH ISHLAYDI', async () => {
    const { service } = createService({ selected: activeOtp(hash(REVIEW_PHONE, REVIEW_CODE)) });

    await expect(service.verify(REVIEW_PHONE, REVIEW_CODE)).resolves.toBeUndefined();
  });

  it('notoʻgʻri kod sinov raqamida ham rad etiladi', async () => {
    const { service } = createService({ selected: activeOtp(hash(REVIEW_PHONE, REVIEW_CODE)) });

    await expect(service.verify(REVIEW_PHONE, '739183')).rejects.toMatchObject({
      code: ErrorCode.OTP_INCORRECT,
    });
  });

  it('oddiy raqamga SMS ketadi va kod tasodifiy', async () => {
    const { service, database, sms } = createService();

    await service.request(PHONE, '10.0.0.1', 'ru');

    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    const [phone, code, lang] = sms.sendOtp.mock.calls[0] ?? [];
    expect(phone).toBe(PHONE);
    expect(lang).toBe('ru');
    expect(code).toMatch(/^\d{6}$/);
    expect(database.inserted[0]?.codeHash).toBe(hash(PHONE, code ?? ''));
  });

  it('sinov hisobi oʻchirilgan boʻlsa oʻsha raqamga ham SMS ketadi', async () => {
    const { service, sms } = createService({ review: false });

    await service.request(REVIEW_PHONE, '10.0.0.1');

    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
  });

  it('★ LIMITLAR SINOV RAQAMIDA HAM ISHLAYDI', async () => {
    // Kod doimiy — soʻrovlar cheklanmasa uni terib topish osonlashardi
    const { service, database } = createService({ cooldownFree: false });

    await expect(service.request(REVIEW_PHONE, '10.0.0.1')).rejects.toMatchObject({
      code: ErrorCode.OTP_COOLDOWN,
    });
    expect(database.inserted).toHaveLength(0);
  });
});

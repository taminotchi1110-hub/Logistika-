import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor';

/**
 * E2E testlar REAL baza va Redis talab qiladi:
 *   npm run infra:up && npm run db:migrate && npm run db:seed
 *   npm run test:e2e
 *
 * Mock qilingan bazada bu testlarning maʼnosi yoʻq — biz aynan SQL cheklovlari,
 * tranzaksiyalar va guard'lar birgalikda ishlashini tekshiryapmiz.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  const phone = `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('tokensiz ochiq', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);
      expect(response.body.data.status).toBe('ok');
    });
  });

  describe('POST /v1/auth/otp/request', () => {
    it('notoʻgʻri raqamni rad etadi', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/otp/request')
        .send({ phone: '12345' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.requestId).toBeDefined();
    });

    it('sxemada yoʻq maydonni rad etadi (mass-assignment himoyasi)', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/otp/request')
        .send({ phone, role: 'ADMIN' })
        .expect(400);
    });

    it('kod yuboradi va formatni qaytaradi', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/otp/request')
        .send({ phone })
        .expect(200);

      expect(response.body.data.expiresInSeconds).toBeGreaterThan(0);
      expect(response.body.data.resendAfterSeconds).toBeGreaterThan(0);
    });

    it('cooldown ichida ikkinchi soʻrovni bloklaydi', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/otp/request')
        .send({ phone })
        .expect(429);

      expect(response.body.error.code).toBe('OTP_COOLDOWN');
      expect(response.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('POST /v1/auth/otp/verify', () => {
    it('notoʻgʻri kodda 400 va qolgan urinishlar soni', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/otp/verify')
        .send({ phone, code: '000000' })
        .expect(400);

      expect(response.body.error.code).toBe('OTP_INCORRECT');
      expect(response.body.error.details.attemptsLeft).toBeGreaterThanOrEqual(0);
    });

    it('toʻgʻri kodda sessiya ochiladi', async () => {
      // Dev muhitida kod javobda qaytadi (OTP_EXPOSE_CODE_IN_DEV=true)
      const fresh = `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
      const requested = await request(app.getHttpServer())
        .post('/v1/auth/otp/request')
        .send({ phone: fresh })
        .expect(200);

      const code = requested.body.data.devCode as string | undefined;
      if (!code) {
        // Kod ochilmagan boʻlsa test maʼnosini yoʻqotadi — sozlamani eslatamiz
        throw new Error('Bu testni ishlatish uchun .env da OTP_EXPOSE_CODE_IN_DEV=true boʻlsin');
      }

      const verified = await request(app.getHttpServer())
        .post('/v1/auth/otp/verify')
        .send({ phone: fresh, code, device: { platform: 'android', appVersion: '1.0.0' } })
        .expect(200);

      expect(verified.body.data.accessToken).toBeDefined();
      expect(verified.body.data.refreshToken).toBeDefined();
      expect(verified.body.data.isNewUser).toBe(true);
      expect(verified.body.data.user.phone).toBe(fresh);

      // Bitta kod faqat bir marta ishlaydi (replay himoyasi)
      await request(app.getHttpServer())
        .post('/v1/auth/otp/verify')
        .send({ phone: fresh, code })
        .expect(400);
    });
  });

  describe('Himoyalangan endpointlar', () => {
    it('tokensiz 401 qaytaradi', async () => {
      const response = await request(app.getHttpServer()).get('/v1/me').expect(401);
      expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('yaroqsiz token bilan 401 qaytaradi', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/me')
        .set('Authorization', 'Bearer aniq.yaroqsiz.token')
        .expect(401);

      expect(response.body.error.code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  describe('GET /v1/reference/all', () => {
    it('tokensiz ochiq va spravochniklarni qaytaradi', async () => {
      const response = await request(app.getHttpServer()).get('/v1/reference/all').expect(200);

      expect(response.body.data.regions).toHaveLength(14);
      expect(response.body.data.vehicleTypes.length).toBeGreaterThan(0);
      expect(response.body.data.version).toBeDefined();
    });

    it('bir xil versiyada faqat oʻzgarish yoʻqligini qaytaradi', async () => {
      const first = await request(app.getHttpServer()).get('/v1/reference/all').expect(200);
      const version = first.body.data.version as string;

      const second = await request(app.getHttpServer())
        .get(`/v1/reference/all?version=${version}`)
        .expect(200);

      expect(second.body.data.changed).toBe(false);
      expect(second.body.data.regions).toBeUndefined();
    });
  });
});

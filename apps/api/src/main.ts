import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true, // pino tayyor boʻlgunicha loglar buferda turadi
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const port = config.get('PORT', { infer: true });
  const prefix = config.get('API_PREFIX', { infer: true });
  const isProd = nodeEnv === 'production' || nodeEnv === 'staging';

  // Reverse proxy ortida turamiz: real IP X-Forwarded-For dan olinadi.
  // Busiz rate limiting butun trafikni bitta IP deb hisoblaydi.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false, // Swagger UI dev'da ishlashi uchun
      crossOriginEmbedderPolicy: false,
    }),
  );

  const corsOrigins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    // Mobil ilova Origin yubormaydi — u CORS'ga umuman tobe emas.
    // Bu ro'yxat faqat brauzerdagi admin panel uchun.
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix(prefix, {
    // Health-check'lar prefikssiz — orkestrator uchun barqaror manzil
    exclude: ['health', 'health/ready'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      // Sxemada yo'q maydon kelsa — 400. Bu mass-assignment himoyasi:
      // hech kim `role: "ADMIN"` ni forma orqali surib kirita olmaydi.
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // ---- OpenAPI ----
  if (!isProd || process.env.ENABLE_SWAGGER === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Karvon API')
      .setDescription(
        'Karvon — Oʻzbekiston uchun yuk almashinuv platformasi.\n\n' +
          'Barcha javoblar `{ data, meta }` qobigʻida qaytadi, xatolar esa ' +
          '`{ error: { code, message, details, requestId } }` koʻrinishida. ' +
          'Mijoz ilova xabarni `code` boʻyicha oʻz tilida koʻrsatadi.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addServer(`http://localhost:${port}`, 'Lokal')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
      customSiteTitle: 'Karvon API',
    });
  }

  // Konteyner SIGTERM yuborganda ochiq soʻrovlar tugatiladi, ulanishlar yopiladi
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  const logger = app.get(PinoLogger);
  logger.log(`Karvon API ishga tushdi: http://localhost:${port}/${prefix} (${nodeEnv})`);
  if (!isProd) logger.log(`OpenAPI hujjati: http://localhost:${port}/docs`);
}

void bootstrap();

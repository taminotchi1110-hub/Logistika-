import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { LoggerModule } from 'nestjs-pino';

import { CommonModule } from '@/common/common.module';
import { validateEnv, type Env } from '@/config/env.schema';
import { DatabaseModule } from '@/infra/database/database.module';
import { RedisModule } from '@/infra/redis/redis.module';
import { StorageModule } from '@/infra/storage/storage.module';
import { AddressesModule } from '@/modules/addresses/addresses.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { DocumentsModule } from '@/modules/documents/documents.module';
import { DriversModule } from '@/modules/drivers/drivers.module';
import { GeoModule } from '@/modules/geo/geo.module';
import { HealthModule } from '@/modules/health/health.module';
import { LoadsModule } from '@/modules/loads/loads.module';
import { MediaModule } from '@/modules/media/media.module';
import { ChatModule } from '@/modules/chat/chat.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { ReferenceModule } from '@/modules/reference/reference.module';
import { SmsModule } from '@/modules/sms/sms.module';
import { UsersModule } from '@/modules/users/users.module';
import { VehiclesModule } from '@/modules/vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env repo ildizida — barcha ilovalar bitta fayldan oʻqiydi
      envFilePath: [resolve(process.cwd(), '../../.env'), '.env'],
      validate: validateEnv,
      cache: true,
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            // Har bir soʻrovga ID — xato javobida qaytadi va logda qidiriladi
            genReqId: (req, res) => {
              const existing = (req.headers['x-request-id'] as string) || randomUUID();
              res.setHeader('X-Request-Id', existing);
              return existing;
            },
            // MAXFIYLIK: token, telefon va hujjat maʼlumotlari logga TUSHMAYDI.
            // Bu shunchaki gigiyena emas — shaxsiy maʼlumot qonuni talabi.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.phone',
                'req.body.code',
                'req.body.refreshToken',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
            autoLogging: {
              ignore: (req) => req.url === '/health' || req.url === '/health/ready',
            },
            transport: isDev
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
              : undefined,
          },
        };
      },
    }),

    // Infratuzilma (global)
    DatabaseModule,
    RedisModule,
    StorageModule,
    CommonModule,

    // Domen modullari
    HealthModule,
    SmsModule,
    UsersModule,
    AuthModule,
    ReferenceModule,
    GeoModule,
    MediaModule,
    DocumentsModule,
    VehiclesModule,
    DriversModule,
    AddressesModule,
    LoadsModule,
    NotificationsModule,
    OrdersModule,
    ChatModule,
  ],
})
export class AppModule {}

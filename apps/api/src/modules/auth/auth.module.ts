import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import type { Env } from '@/config/env.schema';
import { resolveJwtKeys } from '@/config/jwt-keys';
import { SmsModule } from '@/modules/sms/sms.module';
import { UsersModule } from '@/modules/users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    SmsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const keys = resolveJwtKeys(config);
        return {
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
          signOptions: {
            algorithm: 'RS256',
            issuer: config.get('JWT_ISSUER', { infer: true }),
            expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
          },
          verifyOptions: {
            algorithms: ['RS256'],
            issuer: config.get('JWT_ISSUER', { infer: true }),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    // Global guardlar: himoya sukut bo'yicha yoqilgan, ochiqlik esa @Public() bilan.
    // Tartib muhim — avval autentifikatsiya, keyin rol tekshiruvi.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService, AuthService],
})
export class AuthModule {}

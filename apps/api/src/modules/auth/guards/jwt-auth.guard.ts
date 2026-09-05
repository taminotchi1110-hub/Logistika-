import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY, type RequestWithUser } from '@/common/decorators';
import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import { DatabaseService } from '@/infra/database/database.service';

import { TokenService } from '../token.service';

/**
 * Global guard: himoya SUKUT BOʻYICHA yoqilgan.
 * Ochiq endpointlar `@Public()` bilan ataylab belgilanadi.
 *
 * Har bir soʻrovda bitta indekslangan SQL soʻrov bajariladi va u bir vaqtda
 * uchta narsani tekshiradi:
 *   1. sessiya tirikmi (logout / "barcha qurilmalardan chiqish" darhol ishlaydi),
 *   2. foydalanuvchi mavjud va bloklanmaganmi,
 *   3. `token_version` mos keladimi (bloklashda barcha tokenlar kuchsizlanadi).
 *
 * Faqat JWT imzosiga ishonib qolish xato boʻlardi: bloklangan foydalanuvchi
 * tokeni tugagunicha (15 daqiqa) ishlab turaverardi.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw AppError.unauthorized('Token yuborilmadi');
    }

    const payload = this.tokens.verifyAccessToken(token);

    const row = await this.database.db
      .selectFrom('userSessions as s')
      .innerJoin('users as u', 'u.id', 's.userId')
      .select(['u.id as userId', 'u.role', 'u.status', 'u.tokenVersion', 's.id as sessionId'])
      .where('s.id', '=', payload.sid)
      .where('s.userId', '=', payload.sub)
      .where('s.revokedAt', 'is', null)
      .where('s.expiresAt', '>', new Date())
      .where('u.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!row) {
      throw AppError.unauthorized('Sessiya yopilgan', ErrorCode.AUTH_SESSION_REVOKED);
    }
    if (row.tokenVersion !== payload.ver) {
      throw AppError.unauthorized(
        'Token bekor qilingan. Qaytadan kiring.',
        ErrorCode.AUTH_SESSION_REVOKED,
      );
    }
    if (row.status === 'BANNED') {
      throw AppError.forbidden('Akkaunt bloklangan', ErrorCode.USER_BANNED);
    }
    if (row.status === 'SUSPENDED') {
      throw AppError.forbidden('Akkaunt vaqtincha toʻxtatilgan', ErrorCode.USER_SUSPENDED);
    }

    request.user = {
      id: row.userId,
      role: row.role,
      status: row.status,
      sessionId: row.sessionId,
    };

    return true;
  }

  private extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}

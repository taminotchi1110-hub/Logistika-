import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { UserRole } from '@/infra/database/database.types';

// ------------------------------------------------------------------ auth
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Endpointni tokensiz ochiq qiladi.
 *
 * DIQQAT: himoya SUKUT BOʻYICHA yoqilgan (APP_GUARD global). Ochiqlik esa
 * ataylab, aniq belgilanadi. Teskarisi — har bir endpointga qoʻlda guard
 * qoʻyish — ertami-kechmi unutilgan va himoyasiz endpoint bilan tugaydi.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Javobni { data, meta } qobigʻiga OʻRAMASLIK.
 *
 * NEGA KERAK: toʻlov tizimlari (Click, Payme) javobning aynan oʻz
 * formatini kutadi. Qobiq qoʻshilsa ular javobni tushunmaydi va
 * toʻlovni muvaffaqiyatsiz deb belgilaydi — pul yechilgan boʻlsa ham.
 * Bu tashqi protokol talabi, shuning uchun istisno aniq belgilanadi.
 */
export const RAW_RESPONSE_KEY = 'rawResponse';
export const RawResponse = (): MethodDecorator & ClassDecorator =>
  SetMetadata(RAW_RESPONSE_KEY, true);

// ------------------------------------------------------------ rate limit
export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';
export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

/**
 * Umumiy HTTP limitini oʻchiradi.
 *
 * Faqat tashqi tizimlar uchun: toʻlov webhookʻlari (Click/Payme bir necha
 * IP dan keladi va javob olmasa qayta yuboradi — limit toʻlovni yoʻqotardi)
 * va orkestrator sogʻliq tekshiruvi.
 */
export const SkipRateLimit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_RATE_LIMIT_KEY, true);

/**
 * Umumiy limitdan TASHQARI qoʻshimcha, qatʼiyroq limit — qimmat
 * endpointlar uchun (masalan, tashqi geokoding API'siga boradiganlar).
 */
export const RateLimit = (options: RateLimitOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);

export const ROLES_KEY = 'requiredRoles';

/** Endpointga faqat koʻrsatilgan rollar kira oladi. `BOTH` har ikkalasiga mos keladi. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

// ------------------------------------------------------------------ user
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  status: string;
  sessionId: string;
}

/**
 * `id` bu yerda qayta eʼlon qilinmaydi: pino-http uni Express `Request`
 * tipiga oʻzi qoʻshadi (`ReqId`). Takrorlash tiplar konfliktiga olib keladi.
 */
export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/** Kontrollerda joriy foydalanuvchini olish: `@CurrentUser() user: AuthenticatedUser`. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

/** Soʻrovni yuborgan IP — rate limiting va login tarixi uchun. */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  // `trust proxy` yoqilgan boʻlsa Express X-Forwarded-For ni oʻzi hisobga oladi
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
});

/** User-Agent — sessiyani qurilma bilan bogʻlash uchun. */
export const UserAgent = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.headers['user-agent'] ?? 'unknown';
});

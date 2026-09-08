import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';

import { AdminAuthService, type AdminSession } from './admin-auth.service';

export const ADMIN_PERMISSION_KEY = 'adminPermission';

/**
 * Endpoint uchun kerakli huquq.
 *
 * Huquqlar `admin_roles.permissions` da JSON massiv sifatida saqlanadi:
 * `["users.ban", "docs.verify", "payments.refund"]`. `SUPER_ADMIN` da
 * `"*"` bo'ladi va u hamma narsaga kiradi.
 */
export const RequirePermission = (permission: string): MethodDecorator =>
  SetMetadata(ADMIN_PERMISSION_KEY, permission);

export interface AdminRequest extends Request {
  admin?: AdminSession;
}

/**
 * Admin guard.
 *
 * Foydalanuvchi guard'idan MUSTAQIL: admin kontrollerlari `@Public()`
 * bilan belgilanadi (global JWT guard ularni tekshirmasligi uchun) va
 * shu guard ularni o'zicha himoya qiladi.
 *
 * NEGA IKKI GUARD ARALASHTIRILMAGAN: bitta guardda ikki xil token
 * turini qo'llab-quvvatlash — xato qilish oson bo'lgan joy. Ikkita
 * mustaqil guard esa bir-birini "tasodifan o'tkazib yubora" olmaydi.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Admin tokeni yoʻq');
    }

    const admin = await this.auth.verifyToken(header.slice(7));
    request.admin = admin;

    const required = this.reflector.getAllAndOverride<string | undefined>(ADMIN_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required && !hasPermission(admin.permissions, required)) {
      throw AppError.forbidden(
        `Bu amal uchun huquq yoʻq: ${required}`,
        ErrorCode.ADMIN_PERMISSION_DENIED,
      );
    }

    return true;
  }
}

/**
 * Huquq tekshiruvi.
 *
 * `"*"` — hamma narsa. `"users.*"` — `users` guruhidagi hamma amal.
 * Aniq moslik ham ishlaydi.
 */
export function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;

  const group = required.split('.')[0];
  return permissions.includes(`${group}.*`);
}

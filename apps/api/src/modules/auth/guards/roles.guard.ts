import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY, ROLES_KEY, type RequestWithUser } from '@/common/decorators';
import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import type { UserRole } from '@/infra/database/database.types';

/**
 * Rol tekshiruvi. `BOTH` roli — ham yuk beruvchi, ham haydovchi:
 * shuning uchun u ikkala talabga ham javob beradi.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw AppError.unauthorized('Avtorizatsiya talab qilinadi');
    }

    const satisfied = user.role === 'BOTH' || required.includes(user.role);
    if (!satisfied) {
      throw AppError.forbidden(
        'Bu amal sizning rolingiz uchun mavjud emas',
        ErrorCode.USER_ROLE_NOT_ALLOWED,
      );
    }

    return true;
  }
}

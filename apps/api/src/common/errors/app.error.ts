import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode, type ErrorCodeValue } from './error-codes';

export interface AppErrorPayload {
  code: ErrorCodeValue;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Ilovaning yagona xato tipi. Har bir tashlangan xatoda mashinaga tushunarli
 * `code` bo'ladi — mijoz uni tarjima qiladi, monitoring esa bo'yicha guruhlaydi.
 */
export class AppError extends HttpException {
  readonly code: ErrorCodeValue;
  readonly details?: Record<string, unknown>;

  constructor(status: HttpStatus, payload: AppErrorPayload) {
    super({ code: payload.code, message: payload.message, details: payload.details }, status);
    this.code = payload.code;
    this.details = payload.details;
  }

  static badRequest(
    code: ErrorCodeValue,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(HttpStatus.BAD_REQUEST, { code, message, details });
  }

  static unauthorized(
    message = 'Avtorizatsiya talab qilinadi',
    code: ErrorCodeValue = ErrorCode.AUTH_UNAUTHORIZED,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(HttpStatus.UNAUTHORIZED, { code, message, details });
  }

  static forbidden(
    message = 'Ruxsat berilmagan',
    code: ErrorCodeValue = ErrorCode.FORBIDDEN,
  ): AppError {
    return new AppError(HttpStatus.FORBIDDEN, { code, message });
  }

  /**
   * Topilmadi. DIQQAT: begona resursga murojaatda ham AYNAN SHU qaytariladi —
   * 403 resursning mavjudligini oshkor qiladi (IDOR razvedkasi).
   */
  static notFound(message = 'Topilmadi', code: ErrorCodeValue = ErrorCode.NOT_FOUND): AppError {
    return new AppError(HttpStatus.NOT_FOUND, { code, message });
  }

  static conflict(
    code: ErrorCodeValue,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(HttpStatus.CONFLICT, { code, message, details });
  }

  static unprocessable(
    code: ErrorCodeValue,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, { code, message, details });
  }

  static tooManyRequests(
    message: string,
    code: ErrorCodeValue = ErrorCode.RATE_LIMITED,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(HttpStatus.TOO_MANY_REQUESTS, { code, message, details });
  }
}

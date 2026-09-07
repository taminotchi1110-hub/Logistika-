import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppError } from '../errors/app.error';
import { ErrorCode, type ErrorCodeValue } from '../errors/error-codes';

interface ErrorBody {
  error: {
    code: ErrorCodeValue | string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

/**
 * Yagona xato formati. Ichki tafsilotlar (stack, SQL matni, fayl yo'llari)
 * hech qachon mijozga chiqmaydi — ular faqat logda qoladi, foydalanuvchi esa
 * `requestId` ni qo'llab-quvvatlash xizmatiga aytadi va so'rov topiladi.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id ?? 'unknown';

    const { status, body } = this.toErrorBody(exception, requestId);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, requestId, path: request.url, method: request.method },
        'Kutilmagan server xatosi',
      );
    } else if (status === HttpStatus.TOO_MANY_REQUESTS || status === HttpStatus.UNAUTHORIZED) {
      this.logger.warn({ requestId, path: request.url, code: body.error.code }, body.error.message);
    }

    response.status(status).json(body);
  }

  private toErrorBody(exception: unknown, requestId: string): { status: number; body: ErrorBody } {
    if (exception instanceof AppError) {
      const payload = exception.getResponse() as { code: ErrorCodeValue; message: string };
      return {
        status: exception.getStatus(),
        body: {
          error: {
            code: payload.code,
            message: payload.message,
            details: exception.details,
            requestId,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      // ValidationPipe massiv qaytaradi: ['phone must be a valid phone number', ...]
      const rawMessage =
        typeof raw === 'object' && raw !== null && 'message' in raw
          ? (raw as { message: string | string[] }).message
          : exception.message;
      const isFieldList = Array.isArray(rawMessage);

      return {
        status,
        body: {
          error: {
            code:
              status === HttpStatus.BAD_REQUEST ? ErrorCode.VALIDATION_FAILED : `HTTP_${status}`,
            message: isFieldList ? 'Kiritilgan maʼlumot notoʻgʻri' : String(rawMessage),
            details: isFieldList ? { fields: rawMessage } : undefined,
            requestId,
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Serverda kutilmagan xato yuz berdi',
          requestId,
        },
      },
    };
  }
}

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

import { RAW_RESPONSE_KEY } from '@/common/decorators';

export interface ApiResponse<T> {
  data: T;
  meta: Record<string, unknown> & { requestId: string };
}

/** Roʻyxat javoblari shu shaklda qaytadi — meta avtomatik koʻchiriladi. */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

function isPaginated<T>(value: unknown): value is Paginated<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    'hasMore' in value &&
    Array.isArray((value as Paginated<T>).items)
  );
}

/**
 * Barcha muvaffaqiyatli javoblarni { data, meta } qobigʻiga oʻraydi.
 * Kontrollerlar toza domen obyektini qaytaradi va qobiq haqida bilmaydi —
 * shuning uchun javob formatini bir joyda oʻzgartirish mumkin.
 *
 * ISTISNO: `@RawResponse()` bilan belgilangan endpointlar oʻralmaydi.
 * Bu toʻlov tizimlarining webhook'lari uchun kerak — ular javobning
 * aynan oʻz formatini kutadi (docs/17-payments.md).
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<unknown> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<unknown> | T> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (raw) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { id?: string }>();
    const requestId = request.id ?? 'unknown';

    return next.handle().pipe(
      map((payload) => {
        if (isPaginated(payload)) {
          const { items, nextCursor, hasMore } = payload;
          return { data: items, meta: { requestId, nextCursor, hasMore } };
        }
        return { data: payload ?? null, meta: { requestId } };
      }),
    );
  }
}

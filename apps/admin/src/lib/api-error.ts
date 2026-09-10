/**
 * Backend xatolari.
 *
 * API yagona formatda javob beradi:
 *   { error: { code, message, details?, requestId } }
 *
 * MOBIL ILOVADAN FARQI: u foydalanuvchiga ko'rsatiladigan matnni KOD
 * bo'yicha o'zi tanlaydi (server matni faqat o'zbekcha, foydalanuvchi
 * esa ruscha ishlatishi mumkin). Admin panel esa ichki vosita va
 * operatorlar o'zbekcha ishlaydi — shuning uchun serverning matni
 * TO'G'RIDAN-TO'G'RI ko'rsatiladi. Bu ataylab: server matni aniqroq
 * ("Karta raqami noto'g'ri" > "Xatolik yuz berdi") va yangi xato kodi
 * qo'shilganda panelni yangilash kerak emas.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Token eskirgan yoki yo'q — kirish ekraniga qaytish kerak. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** Huquq yetmaydi — kirish holati o'zgarmaydi, faqat amal rad etiladi. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /**
   * Tarmoq uzilgan: qayta urinish mantiqiy.
   *
   * `status === 0` — server javob bermadi (fetch xatosi). Bu 500 dan
   * farq qiladi: 500 da so'rov SERVERGA YETDI va uni takrorlash
   * xavfli bo'lishi mumkin (masalan payout ikki marta bajarilishi).
   */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Javobdan `ApiError` yasaydi.
 *
 * Javob JSON bo'lmasligi mumkin (nginx 502 sahifasi, timeout) —
 * shuning uchun `catch` va zaxira matn.
 */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // JSON emas — quyida zaxira matn ishlatiladi
  }

  const error = body.error;
  return new ApiError(
    error?.code ?? `HTTP_${response.status}`,
    error?.message ?? `Server xatosi (${response.status})`,
    response.status,
    error?.details,
    error?.requestId,
  );
}

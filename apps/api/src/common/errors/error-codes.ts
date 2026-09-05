/**
 * Xato kodlari — mijoz ilova aynan SHU kod bo'yicha xabarni o'z tilida ko'rsatadi.
 * Serverdagi `message` — faqat zaxira (log va debug uchun).
 * Kod bir marta belgilanadi va O'ZGARMAYDI: mobil ilovaning eski versiyalari
 * foydalanuvchilarda uzoq vaqt qolib ketadi.
 */
export const ErrorCode = {
  // --- umumiy ---
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // --- autentifikatsiya ---
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_SESSION_REVOKED: 'AUTH_SESSION_REVOKED',
  AUTH_REFRESH_REUSED: 'AUTH_REFRESH_REUSED',

  // --- OTP ---
  OTP_INVALID_PHONE: 'OTP_INVALID_PHONE',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  OTP_TOO_MANY_REQUESTS: 'OTP_TOO_MANY_REQUESTS',
  OTP_NOT_FOUND: 'OTP_NOT_FOUND',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INCORRECT: 'OTP_INCORRECT',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  OTP_SEND_FAILED: 'OTP_SEND_FAILED',

  // --- foydalanuvchi ---
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_BANNED: 'USER_BANNED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_PROFILE_INCOMPLETE: 'USER_PROFILE_INCOMPLETE',
  USER_ROLE_NOT_ALLOWED: 'USER_ROLE_NOT_ALLOWED',

  // --- haydovchi ---
  DRIVER_NOT_VERIFIED: 'DRIVER_NOT_VERIFIED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

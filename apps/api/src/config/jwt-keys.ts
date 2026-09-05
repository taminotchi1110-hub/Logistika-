import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';

import type { Env } from './env.schema';

export interface JwtKeyPair {
  privateKey: string;
  publicKey: string;
}

let cached: JwtKeyPair | null = null;

/**
 * `.env` da PEM koʻpincha bitta qatorga `\n` bilan yoziladi — uni tiklaymiz.
 * Base64 koʻrinishi ham qoʻllab-quvvatlanadi (Kubernetes secret'larida qulay).
 */
function normalizePem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('-----BEGIN')) return trimmed.replace(/\\n/g, '\n');
  return Buffer.from(trimmed, 'base64').toString('utf8');
}

/**
 * JWT kalitlarini beradi.
 *
 * Prod/staging: kalitlar env'dan keladi (env.schema.ts buni majburlaydi).
 * Dev: kalit boʻlmasa vaqtinchalik juftlik generatsiya qilinadi — yangi
 * dasturchi hech narsa sozlamasdan `npm run dev` qila oladi. Ilova qayta
 * ishga tushganda kalit oʻzgaradi va eski tokenlar bekor boʻladi (dev uchun normal).
 *
 * NEGA RS256, HS256 EMAS: kelajakda tracking va matching servislari tokenni
 * mustaqil tekshiradi. Ular faqat OCHIQ kalitni oladi — imzo kaliti esa
 * yagona joyda (auth) qoladi. Umumiy maxfiy kalitni tarqatish xavfli.
 */
export function resolveJwtKeys(config: ConfigService<Env, true>): JwtKeyPair {
  if (cached) return cached;

  const privateKey = config.get('JWT_PRIVATE_KEY', { infer: true });
  const publicKey = config.get('JWT_PUBLIC_KEY', { infer: true });

  if (privateKey && publicKey) {
    cached = { privateKey: normalizePem(privateKey), publicKey: normalizePem(publicKey) };
    return cached;
  }

  const nodeEnv = config.get('NODE_ENV', { infer: true });
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    // env.schema bunga yoʻl qoʻymaydi, lekin himoya ikki qavatli boʻlgani maʼqul
    throw new Error('JWT kalitlari production muhitida majburiy.');
  }

  const generated = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  new Logger('JwtKeys').warn(
    'JWT kalitlari topilmadi — dev uchun vaqtinchalik juftlik yaratildi. ' +
      'Server qayta ishga tushsa barcha tokenlar bekor boʻladi.',
  );

  cached = { privateKey: generated.privateKey, publicKey: generated.publicKey };
  return cached;
}

/** Testlarda izolyatsiya uchun. */
export function resetJwtKeysCache(): void {
  cached = null;
}

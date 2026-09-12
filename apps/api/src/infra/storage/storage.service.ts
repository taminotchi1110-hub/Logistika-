import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import type { Env } from '@/config/env.schema';

export interface PresignedUpload {
  /** Mijoz shu manzilga PUT qiladi. */
  uploadUrl: string;
  /** Yuklangach shu kalit serverga qaytariladi. */
  fileKey: string;
  expiresInSeconds: number;
  maxBytes: number;
}

export interface ObjectMetadata {
  sizeBytes: number;
  mimeType: string | null;
  checksumSha256: string | null;
}

/** Ruxsat etilgan MIME turlari — kengaytma emas, aynan MIME tekshiriladi. */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/**
 * S3-mos storage (oʻz serverimizda SeaweedFS; keyin istalgan S3 mos bulut).
 *
 * ASOSIY QARORLAR:
 *  1. **Fayl API server orqali oʻtmaydi.** Mijoz presigned URL oladi va
 *     toʻgʻridan-toʻgʻri S3 ga yuklaydi. 20 MB rasm API replikasining
 *     xotirasi va CPU'sini band qilmaydi.
 *  2. **Bucket private.** Oʻqish ham presigned URL orqali, muddati 5 daqiqa.
 *     Hujjat havolasi Telegram'ga tashlansa ham bir necha daqiqada oʻladi.
 *  3. **Fayl nomi foydalanuvchidan olinmaydi** — UUID generatsiya qilinadi.
 *     Bu path traversal va nomdagi zararli belgilar muammosini butunlay yopadi.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly uploadTtl: number;
  private readonly downloadTtl: number;
  private readonly maxBytes: number;
  private readonly isDev: boolean;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.uploadTtl = config.get('S3_UPLOAD_URL_TTL_SECONDS', { infer: true });
    this.downloadTtl = config.get('S3_DOWNLOAD_URL_TTL_SECONDS', { infer: true });
    this.maxBytes = config.get('S3_MAX_UPLOAD_BYTES', { infer: true });
    this.isDev = config.get('NODE_ENV', { infer: true }) === 'development';

    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      // Oʻz serverimizdagi ombor virtual-host stilini (bucket.domen) DNS
      // sozlamasisiz qoʻllab-quvvatlamaydi — yoʻl stili (domen/bucket)
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    });
  }

  /**
   * Dev'da bucket boʻlmasa yaratamiz — yangi dasturchi hech narsa sozlamaydi.
   *
   * Prodda YARATILMAYDI: nomdagi xato yangi boʻsh bucket ochib yuborardi va
   * hujjatlar "yoʻqolgandek" koʻrinardi. U yerda uni `scripts/deploy.sh` yaratadi.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      if (!this.isDev) {
        this.logger.error(`S3 bucket topilmadi: ${this.bucket} (deploy.sh yaratadi)`);
        return;
      }
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`S3 bucket yaratildi: ${this.bucket}`);
      } catch (error) {
        this.logger.warn({ err: error }, 'S3 bucket yaratib boʻlmadi');
      }
    }
  }

  /**
   * Yuklash uchun presigned URL.
   *
   * `ContentType` va `ContentLength` imzoga kiradi: mijoz PUT qilganda
   * aynan shu qiymatlarni yuborishi shart. Aks holda S3 rad etadi — yaʼni
   * "10 MB rasm" deb aytib 500 MB video yuklab boʻlmaydi.
   */
  async createUploadUrl(params: {
    prefix: string;
    mimeType: AllowedMimeType;
    sizeBytes: number;
  }): Promise<PresignedUpload> {
    const extension = EXTENSION_BY_MIME[params.mimeType] ?? 'bin';
    const now = new Date();
    const fileKey = `${params.prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
      this.client,
      // ChecksumAlgorithm ataylab qoʻyilmagan: u mijozdan qoʻshimcha imzolangan
      // sarlavha (`x-amz-checksum-sha256`) talab qiladi va mobil ilovada faylni
      // yuklashdan oldin butunlay hash qilishga majbur qilardi. Fayl butunligi
      // yuklangandan keyin `HeadObject` orqali (hajm va MIME) tekshiriladi.
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        ContentType: params.mimeType,
        ContentLength: params.sizeBytes,
      }),
      { expiresIn: this.uploadTtl },
    );

    return {
      uploadUrl,
      fileKey,
      expiresInSeconds: this.uploadTtl,
      maxBytes: this.maxBytes,
    };
  }

  /** Oʻqish uchun qisqa muddatli havola. */
  async createDownloadUrl(fileKey: string, downloadName?: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        ResponseContentDisposition: downloadName
          ? `attachment; filename="${encodeURIComponent(downloadName)}"`
          : undefined,
      }),
      { expiresIn: this.downloadTtl },
    );
  }

  /**
   * Fayl haqiqatan yuklanganini va hajmini tekshiradi.
   * Mijoz "yukladim" deb yolgʻon aytishi mumkin — biz S3'dan soʻraymiz.
   */
  async getMetadata(fileKey: string): Promise<ObjectMetadata | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: fileKey }),
      );
      return {
        sizeBytes: head.ContentLength ?? 0,
        mimeType: head.ContentType ?? null,
        checksumSha256: head.ChecksumSHA256 ?? null,
      };
    } catch {
      return null;
    }
  }

  async delete(fileKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: fileKey }));
  }

  get maxUploadBytes(): number {
    return this.maxBytes;
  }
}

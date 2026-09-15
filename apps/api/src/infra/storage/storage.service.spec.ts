import type { ConfigService } from '@nestjs/config';

import type { Env } from '@/config/env.schema';

import { StorageService } from './storage.service';

const values: Partial<Record<keyof Env, unknown>> = {
  NODE_ENV: 'test',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'karvon',
  S3_ACCESS_KEY: 'karvon',
  S3_SECRET_KEY: 'karvon_dev_password',
  S3_FORCE_PATH_STYLE: true,
  S3_UPLOAD_URL_TTL_SECONDS: 600,
  S3_DOWNLOAD_URL_TTL_SECONDS: 300,
  S3_MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
};

const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;

/** Imzolangan PUT havolasi (tarmoqqa chiqmaydi — imzo lokal hisoblanadi). */
async function uploadParams(): Promise<URLSearchParams> {
  const { uploadUrl } = await new StorageService(config).createUploadUrl({
    prefix: 'document/u-1',
    mimeType: 'image/jpeg',
    sizeBytes: 8192,
  });
  return new URL(uploadUrl).searchParams;
}

describe('StorageService — imzolangan yuklash havolasi', () => {
  it('★ HAVOLADA BOʻSH TANANING CHECKSUMI YOʻQ', async () => {
    // SDK standart holatda `x-amz-checksum-crc32=AAAAAA==` qo'shardi va
    // SeaweedFS (hamda AWS) 8 KB faylni shu qiymat bilan solishtirib rad
    // etardi — CI da hujjat yuklash testlari aynan shundan yiqildi
    const params = await uploadParams();

    expect(params.has('x-amz-checksum-crc32')).toBe(false);
    expect(params.has('x-amz-sdk-checksum-algorithm')).toBe(false);
  });

  it('★ HAJM VA MIME TURI IMZOGA KIRADI', async () => {
    // Mijoz boshqa hajm yoki tur bilan yuklasa, ombor imzoni rad etadi
    const signed = (await uploadParams()).get('X-Amz-SignedHeaders')?.split(';');

    expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
  });

  it('havola qisqa muddatli', async () => {
    expect((await uploadParams()).get('X-Amz-Expires')).toBe('600');
  });
});

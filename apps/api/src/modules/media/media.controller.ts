import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '@/common/decorators';
import { AppError } from '@/common/errors/app.error';
import { ErrorCode } from '@/common/errors/error-codes';
import {
  ALLOWED_MIME_TYPES,
  StorageService,
  type AllowedMimeType,
} from '@/infra/storage/storage.service';

/** Fayl qayerga tegishli — S3 kalitidagi prefiks shundan hosil boʻladi. */
const UPLOAD_PURPOSES = ['avatar', 'document', 'vehicle', 'load', 'chat', 'proof'] as const;
type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export class PresignUploadDto {
  @ApiProperty({ enum: UPLOAD_PURPOSES })
  @IsIn(UPLOAD_PURPOSES)
  purpose!: UploadPurpose;

  @ApiProperty({ enum: ALLOWED_MIME_TYPES })
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType!: AllowedMimeType;

  @ApiProperty({ example: 1_048_576, description: 'Fayl hajmi (bayt)' })
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes!: number;
}

export class DownloadUrlDto {
  @ApiProperty({ example: 'document/2026/09/9f3c….jpg' })
  @IsString()
  fileKey!: string;
}

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign')
  @ApiOperation({
    summary: 'Yuklash uchun vaqtinchalik havola',
    description:
      'Javobdagi `uploadUrl` ga faylni **PUT** qiling. Sarlavhalarda `Content-Type` va ' +
      '`Content-Length` aynan soʻrovdagidek boʻlishi shart — ular imzoga kiradi. ' +
      'Yuklangach `fileKey` ni tegishli endpointga yuboring (masalan hujjat yaratish).',
  })
  async presign(@CurrentUser() user: AuthenticatedUser, @Body() dto: PresignUploadDto) {
    if (dto.sizeBytes > this.storage.maxUploadBytes) {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        `Fayl juda katta. Maksimum: ${Math.floor(this.storage.maxUploadBytes / 1024 / 1024)} MB`,
        { maxBytes: this.storage.maxUploadBytes },
      );
    }

    // PDF faqat hujjat uchun — chatga yoki avatarga PDF yuklashning maʼnosi yoʻq
    if (dto.mimeType === 'application/pdf' && dto.purpose !== 'document' && dto.purpose !== 'load') {
      throw AppError.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'PDF faqat hujjat va yuk uchun qabul qilinadi',
      );
    }

    // Kalit foydalanuvchi ID si bilan boshlanadi: kim yuklaganini kalitning
    // oʻzidan koʻrish mumkin va begona faylni taxmin qilib topib boʻlmaydi.
    return this.storage.createUploadUrl({
      prefix: `${dto.purpose}/${user.id}`,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
  }

  @Post('download-url')
  @ApiOperation({
    summary: 'Oʻqish uchun vaqtinchalik havola',
    description:
      'Faqat oʻzingiz yuklagan fayllar. Boshqa foydalanuvchining faylini olish uchun ' +
      'tegishli endpointdan foydalaning (masalan buyurtma hujjatlari).',
  })
  async downloadUrl(@CurrentUser() user: AuthenticatedUser, @Body() dto: DownloadUrlDto) {
    // Kalit `<purpose>/<userId>/...` koʻrinishida — egalik shundan tekshiriladi.
    // Bu oddiy, lekin ishonchli: kalit tuzilishi serverda hosil qilinadi.
    if (!dto.fileKey.includes(`/${user.id}/`)) {
      throw AppError.notFound('Fayl topilmadi');
    }

    const metadata = await this.storage.getMetadata(dto.fileKey);
    if (!metadata) {
      throw AppError.notFound('Fayl topilmadi');
    }

    return {
      url: await this.storage.createDownloadUrl(dto.fileKey),
      sizeBytes: metadata.sizeBytes,
      mimeType: metadata.mimeType,
    };
  }
}

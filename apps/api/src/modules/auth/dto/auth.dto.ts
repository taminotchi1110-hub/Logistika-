import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { normalizeUzPhone } from '@/common/utils/phone.util';

/**
 * Telefon raqamini DTO darajasidayoq E.164 ga keltiramiz.
 * Shundan keyin butun ilova bo'ylab raqam faqat bitta ko'rinishda yuradi —
 * servislar formatlash haqida o'ylamaydi.
 *
 * NORMALIZATSIYA RAD ETSA — BO'SH SATR, asl qiymat EMAS.
 *
 * Ilgari bu yerda `?? value` turardi va rad etilgan raqam asl holida
 * o'tib ketardi. Keyingi `@Matches` esa faqat SHAKLNI tekshiradi
 * (+998 va 9 ta raqam), operator prefiksini emas — natijada
 * `+998 71 …` (Toshkent shahar raqami) validatsiyadan o'tib ketardi.
 * Platforma SMS yuborar va PUL TO'LAR edi, kod esa hech qachon yetib
 * bormasdi: shahar raqami SMS qabul qila olmaydi.
 */
const NormalizePhone = (): PropertyDecorator =>
  Transform(({ value }) =>
    typeof value === 'string' ? (normalizeUzPhone(value) ?? '') : value,
  );

export class DeviceDto {
  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6', description: 'Qurilmaning barqaror IDsi' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({ example: 'android', enum: ['android', 'ios', 'web'] })
  @IsOptional()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  appVersion?: string;
}

export class RequestOtpDto {
  @ApiProperty({
    example: '+998901234567',
    description: 'Har qanday formatda: 901234567, +998 90 123-45-67, 998901234567',
  })
  @NormalizePhone()
  @IsString()
  @Matches(/^\+998\d{9}$/, { message: 'Telefon raqami notoʻgʻri' })
  phone!: string;

  @ApiPropertyOptional({ enum: ['uz', 'ru', 'en'], default: 'uz' })
  @IsOptional()
  @IsIn(['uz', 'ru', 'en'])
  lang?: 'uz' | 'ru' | 'en';
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+998901234567' })
  @NormalizePhone()
  @IsString()
  @Matches(/^\+998\d{9}$/, { message: 'Telefon raqami notoʻgʻri' })
  phone!: string;

  @ApiProperty({ example: '482913', minLength: 4, maxLength: 8 })
  @IsString()
  @Length(4, 8)
  @Matches(/^\d+$/, { message: 'Kod faqat raqamlardan iborat boʻlishi kerak' })
  code!: string;

  @ApiPropertyOptional({ type: DeviceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Oldingi javobda olingan refresh token' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;

  @ApiPropertyOptional({ type: DeviceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class CompleteProfileDto {
  @ApiProperty({ example: 'Bobur' })
  @IsString()
  @Length(2, 64)
  firstName!: string;

  @ApiProperty({ example: 'Aliyev' })
  @IsString()
  @Length(2, 64)
  lastName!: string;

  @ApiProperty({ enum: ['SHIPPER', 'DRIVER', 'BOTH'], example: 'SHIPPER' })
  @IsIn(['SHIPPER', 'DRIVER', 'BOTH'])
  role!: 'SHIPPER' | 'DRIVER' | 'BOTH';

  @ApiPropertyOptional({ enum: ['uz', 'ru', 'en'] })
  @IsOptional()
  @IsIn(['uz', 'ru', 'en'])
  lang?: 'uz' | 'ru' | 'en';
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { normalizeUzPhone } from '@/common/utils/phone.util';
import type { PaymentMethod } from '@/infra/database/database.types';

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'ESCROW'];

const NormalizePhone = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === 'string' ? (normalizeUzPhone(value) ?? value) : value));

export class LoadPointDto {
  @ApiProperty({ example: 'Toshkent, Yunusobod, Amir Temur 108' })
  @IsString()
  @Length(5, 500)
  address!: string;

  @ApiProperty({ example: 41.3111 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 69.2797 })
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ example: 'Anvar aka' })
  @IsOptional()
  @IsString()
  @MaxLength(96)
  contactName?: string;

  @ApiPropertyOptional({ example: '901234567' })
  @IsOptional()
  @NormalizePhone()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;
}

export class CreateLoadDto {
  @ApiProperty({ example: 'Mebel — 5 ta shkaf' })
  @IsString()
  @Length(3, 160)
  title!: string;

  @ApiPropertyOptional({ example: 'Ehtiyot boʻlib yuklash kerak, shisha eshiklar bor' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 3, description: 'reference/cargo-categories dan' })
  @IsInt()
  @Min(1)
  categoryId!: number;

  @ApiProperty({ example: 4500, description: 'Ogʻirlik (kg)' })
  @IsInt()
  @Min(1)
  @Max(60_000)
  weightKg!: number;

  @ApiPropertyOptional({ example: 18.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(200)
  volumeM3?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  packagesCount?: number;

  @ApiPropertyOptional({ example: 'palet', enum: ['palet', 'qop', 'quti', 'bochka', 'rulon', 'boshqa'] })
  @IsOptional()
  @IsIn(['palet', 'qop', 'quti', 'bochka', 'rulon', 'boshqa'])
  packageType?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFragile?: boolean;

  @ApiPropertyOptional({ example: 2, description: 'Muzlatilgan/sovutilgan yuk uchun' })
  @IsOptional()
  @IsInt()
  @Min(-30)
  @Max(30)
  tempMinC?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(-30)
  @Max(30)
  tempMaxC?: number;

  @ApiProperty({ type: LoadPointDto })
  @ValidateNested()
  @Type(() => LoadPointDto)
  pickup!: LoadPointDto;

  @ApiProperty({ type: LoadPointDto })
  @ValidateNested()
  @Type(() => LoadPointDto)
  delivery!: LoadPointDto;

  @ApiProperty({ example: '2026-09-08T09:00:00Z', description: 'Yuklash oynasi boshlanishi' })
  @IsDateString()
  pickupFrom!: string;

  @ApiProperty({ example: '2026-09-08T13:00:00Z', description: 'Yuklash oynasi tugashi' })
  @IsDateString()
  pickupTo!: string;

  @ApiPropertyOptional({ example: '2026-09-09T18:00:00Z' })
  @IsOptional()
  @IsDateString()
  deliveryBy?: string;

  @ApiPropertyOptional({ type: [Number], example: [4, 5] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsInt({ each: true })
  requiredVehicleTypeIds?: number[];

  @ApiPropertyOptional({ type: [Number], example: [1] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  requiredBodyTypeIds?: number[];

  @ApiPropertyOptional({ type: [Number], example: [1, 2] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  specialRequirementIds?: number[];

  @ApiPropertyOptional({ example: 240_000_000, description: 'Narx TIYINDA (2 400 000 soʻm)' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  priceTiyin?: number;

  @ApiPropertyOptional({ default: false, description: 'Kelishuv asosida ("torg bor")' })
  @IsOptional()
  @IsBoolean()
  isNegotiable?: boolean;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS, default: 'CASH' })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    default: false,
    description: 'true — darhol eʼlon qilinadi; false — qoralama saqlanadi',
  })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}

export class UpdateLoadDto extends PartialType(CreateLoadDto) {}

export class EstimateLoadDto {
  @ApiProperty({ example: 41.3111 })
  @Type(() => Number)
  @IsLatitude()
  fromLat!: number;

  @ApiProperty({ example: 69.2797 })
  @Type(() => Number)
  @IsLongitude()
  fromLng!: number;

  @ApiProperty({ example: 39.6542 })
  @Type(() => Number)
  @IsLatitude()
  toLat!: number;

  @ApiProperty({ example: 66.9597 })
  @Type(() => Number)
  @IsLongitude()
  toLng!: number;

  @ApiProperty({ example: 4500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60_000)
  weightKg!: number;

  @ApiPropertyOptional({ type: [Number], example: [4] })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map(Number).filter(Number.isInteger) : value,
  )
  @IsArray()
  @ArrayMaxSize(15)
  @IsInt({ each: true })
  vehicleTypeIds?: number[];
}

export class CancelLoadDto {
  @ApiProperty({ example: 'Yuk boshqa yoʻl bilan joʻnatildi' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

/** Haydovchi lentasi va "mening yuklarim" uchun umumiy filtr. */
export class LoadFeedQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fromRegionId?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  toRegionId?: number;

  @ApiPropertyOptional({ example: '2026-09-08' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-10' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minWeightKg?: number;

  @ApiPropertyOptional({ example: 20_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxWeightKg?: number;

  @ApiPropertyOptional({ example: 100_000_000, description: 'Tiyinda' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceTiyin?: number;

  @ApiPropertyOptional({ type: [Number], example: [4, 5] })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map(Number).filter(Number.isInteger) : value,
  )
  @IsArray()
  @ArrayMaxSize(15)
  @IsInt({ each: true })
  vehicleTypeIds?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map(Number).filter(Number.isInteger) : value,
  )
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  bodyTypeIds?: number[];

  @ApiPropertyOptional({ example: 50, description: 'Mendan shuncha km radiusda (lat/lng bilan)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxDistanceKm?: number;

  @ApiPropertyOptional({ example: 41.3111 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 69.2797 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({
    enum: ['created_at', 'price_desc', 'price_asc', 'pickup_date', 'distance_asc'],
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(['created_at', 'price_desc', 'price_asc', 'pickup_date', 'distance_asc'])
  sort?: 'created_at' | 'price_desc' | 'price_asc' | 'pickup_date' | 'distance_asc';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

import { normalizePlate } from '@/common/utils/plate.util';

export class CreateVehicleDto {
  @ApiProperty({ example: 1, description: 'reference/vehicle-types dan' })
  @IsInt()
  @Min(1)
  vehicleTypeId!: number;

  @ApiProperty({ example: 1, description: 'reference/body-types dan' })
  @IsInt()
  @Min(1)
  bodyTypeId!: number;

  @ApiProperty({ example: 'Isuzu' })
  @IsString()
  @Length(2, 48)
  brand!: string;

  @ApiProperty({ example: 'NPR 75' })
  @IsString()
  @Length(1, 48)
  model!: string;

  @ApiPropertyOptional({ example: 2019 })
  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(new Date().getFullYear() + 1)
  year?: number;

  @ApiProperty({
    example: '01 A 123 BC',
    description: 'Har qanday formatda — server normallashtiradi',
  })
  @Transform(({ value }) => (typeof value === 'string' ? (normalizePlate(value) ?? value) : value))
  @IsString()
  @Length(7, 16)
  plateNumber!: string;

  @ApiPropertyOptional({ example: 'Oq' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  color?: string;

  @ApiProperty({ example: 5000, description: 'Yuk koʻtarish quvvati (kg)' })
  @IsInt()
  @Min(100)
  @Max(60_000)
  capacityKg!: number;

  @ApiProperty({ example: 25.5, description: 'Kuzov hajmi (m³)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(200)
  volumeM3!: number;

  @ApiPropertyOptional({ example: 6.2 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(30)
  lengthM?: number;

  @ApiPropertyOptional({ example: 2.4 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5)
  widthM?: number;

  @ApiPropertyOptional({ example: 2.6 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5)
  heightM?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasTrailer?: boolean;

  @ApiPropertyOptional({ example: 20_000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(60_000)
  trailerCapacityKg?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(200)
  trailerVolumeM3?: number;

  @ApiPropertyOptional({ default: false, description: 'Gidrobort mavjudmi' })
  @IsOptional()
  @IsBoolean()
  hasHydroBoard?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasRamp?: boolean;

  @ApiPropertyOptional({ example: -18, description: 'Refrijerator uchun minimal harorat' })
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

  @ApiPropertyOptional({ default: false, description: 'Xavfli yuk (ADR) sertifikati' })
  @IsOptional()
  @IsBoolean()
  adrCertified?: boolean;

  @ApiPropertyOptional({ example: '2027-03-15' })
  @IsOptional()
  @IsDateString()
  insuranceExpiresAt?: string;

  @ApiPropertyOptional({ example: '2027-01-20' })
  @IsOptional()
  @IsDateString()
  inspectionExpiresAt?: string;
}

/** Tahrirlashda barcha maydonlar ixtiyoriy, lekin bir xil qoidalar bilan. */
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { CurrentUser, Roles, type AuthenticatedUser } from '@/common/decorators';

import { TrackingService } from './tracking.service';

export class LocationPointDto {
  @ApiProperty({ example: 41.3111 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 69.2797 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ example: 62.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(400)
  speedKmh?: number;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(359)
  headingDeg?: number;

  @ApiPropertyOptional({ example: 8.5, description: 'GPS aniqligi (metr)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracyM?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  altitudeM?: number;

  @ApiPropertyOptional({ example: 74 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPct?: number;

  @ApiPropertyOptional({
    description: 'Android mock-location bayrogʻi — ilova oʻzi xabar beradi',
  })
  @IsOptional()
  @IsBoolean()
  isMock?: boolean;

  @ApiPropertyOptional({ description: 'Qurilmada qayd etilgan vaqt (oflayn bufer uchun)' })
  @IsOptional()
  @IsISO8601()
  recordedAt?: string;
}

export class RecordLocationDto {
  @ApiProperty({ type: [LocationPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LocationPointDto)
  points!: LocationPointDto[];
}

@ApiTags('tracking')
@ApiBearerAuth()
@Controller()
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post('me/driver/location')
  @Roles('DRIVER')
  @ApiOperation({
    summary: 'Joylashuvni yuborish (REST zaxira)',
    description:
      'Asosiy yoʻl — WebSocket `location:update`. Bu endpoint aloqa uzilib ' +
      'qayta tiklanganda buferdagi nuqtalarni TOʻPLAM bilan yuborish uchun. ' +
      'Javobdagi `tracking` — marshrut tarixi yozildimi. Faol reys boʻlmasa ' +
      '`tracking: false` qaytadi va MARSHRUT YOZILMAYDI (maxfiylik qoidasi), ' +
      'lekin matching keshi baribir yangilanadi — bu bitta joriy nuqta, ' +
      'tarix emas. Xato qaytarilmaydi: haydovchi ilovasi reys holatini ' +
      'server bilan bir vaqtda bilmasligi mumkin va bu normal holat.',
  })
  record(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordLocationDto) {
    return this.tracking.record(user.id, dto.points);
  }

  @Get('orders/:id/location')
  @ApiOperation({
    summary: 'Buyurtmaning oxirgi joylashuvi',
    description:
      'Yuk beruvchi va haydovchi uchun. Kuzatuv hali boshlanmagan yoki ' +
      'tugagan boʻlsa `null` qaytadi.',
  })
  last(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tracking.lastLocation(id, user.id);
  }

  @Get('orders/:id/track')
  @ApiOperation({
    summary: 'Buyurtma marshruti',
    description:
      'Google Encoded Polyline formatida — xaritada bitta chiziq bilan ' +
      'chiziladi. Yakunlangan buyurtmada arxivdan oʻqiladi.',
  })
  track(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tracking.track(id, user.id);
  }
}

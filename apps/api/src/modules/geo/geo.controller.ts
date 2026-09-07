import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

import { GeocodingService } from './geocoding.service';
import { GeoService } from './geo.service';
import { RoutingService } from './routing.service';

export class GeoSearchDto {
  @IsString()
  @Length(3, 160)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class GeoPointDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}

export class GeoRouteDto {
  @Type(() => Number)
  @IsLatitude()
  fromLat!: number;

  @Type(() => Number)
  @IsLongitude()
  fromLng!: number;

  @Type(() => Number)
  @IsLatitude()
  toLat!: number;

  @Type(() => Number)
  @IsLongitude()
  toLng!: number;
}

@ApiTags('geo')
@ApiBearerAuth()
@Controller('geo')
export class GeoController {
  constructor(
    private readonly geocoding: GeocodingService,
    private readonly routing: RoutingService,
    private readonly geo: GeoService,
  ) {}

  @Get('search')
  @ApiOperation({
    summary: 'Manzil qidirish (avtokomplit)',
    description: 'Natijalar 24 soat keshlanadi — bir xil soʻrov provayderga qayta ketmaydi.',
  })
  search(@Query() dto: GeoSearchDto) {
    return this.geocoding.search(dto.q, dto.limit ?? 8);
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Koordinatadan manzil (xaritadan pin qoʻyilganda)' })
  async reverse(@Query() dto: GeoPointDto) {
    const [place, region] = await Promise.all([
      this.geocoding.reverse(dto),
      this.geo.resolveRegion(dto),
    ]);

    return {
      label: place?.label ?? null,
      lat: dto.lat,
      lng: dto.lng,
      ...region,
    };
  }

  @Get('route')
  @ApiOperation({
    summary: 'Masofa, taxminiy vaqt va marshrut chizigʻi',
    description:
      '`source: "osrm"` — aniq yoʻl masofasi. `source: "estimate"` — OSRM mavjud emas, ' +
      'masofa taxminiy hisoblangan (lokal ishlab chiqishda normal, prodda boʻlmaydi).',
  })
  route(@Query() dto: GeoRouteDto) {
    const from = { lat: dto.fromLat, lng: dto.fromLng };
    const to = { lat: dto.toLat, lng: dto.toLng };

    this.geo.assertUsablePoint(from, 'from');
    this.geo.assertUsablePoint(to, 'to');

    return this.routing.route(from, to);
  }
}

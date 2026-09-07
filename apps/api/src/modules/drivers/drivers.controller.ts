import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { CurrentUser, Roles, type AuthenticatedUser } from '@/common/decorators';
import type { DriverAvailability } from '@/infra/database/database.types';

import { DriversService } from './drivers.service';

export class SetAvailabilityDto {
  @ApiProperty({ enum: ['AVAILABLE', 'BUSY', 'OFFLINE'] })
  @IsIn(['AVAILABLE', 'BUSY', 'OFFLINE'])
  availability!: DriverAvailability;
}

export class UpdateLocationDto {
  @ApiProperty({ example: 41.2995 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 69.2401 })
  @IsLongitude()
  lng!: number;
}

export class AddRouteDto {
  @ApiProperty({ example: 1, description: 'Qaysi viloyatdan' })
  @IsInt()
  @Min(1)
  fromRegionId!: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Qayerga. Yubormasangiz — "istalgan yoʻnalishga" degani',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  toRegionId?: number;

  @ApiPropertyOptional({ default: false, description: 'Muntazam qatnaydigan yoʻnalish' })
  @IsOptional()
  @IsBoolean()
  isRegular?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Ustuvorlik: katta son = afzalroq' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;
}

@ApiTags('drivers')
@ApiBearerAuth()
@Roles('DRIVER')
@Controller('me/driver')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get('readiness')
  @ApiOperation({
    summary: 'Verifikatsiya tayyorligi',
    description:
      'Roʻyxatdan oʻtish jarayonining yagona manbai. `missingSteps` — qolgan qadamlar, ' +
      '`canSendOffers` — taklif yubora oladimi.',
  })
  readiness(@CurrentUser() user: AuthenticatedUser) {
    return this.drivers.getReadiness(user.id);
  }

  @Post('submit-verification')
  @ApiOperation({ summary: 'Profilni admin tekshiruviga yuborish' })
  submit(@CurrentUser() user: AuthenticatedUser) {
    return this.drivers.submitForVerification(user.id);
  }

  @Patch('availability')
  @ApiOperation({
    summary: 'Boʻsh / band / oflayn holati',
    description: '`AVAILABLE` ga oʻtish uchun verifikatsiya yakunlangan boʻlishi shart.',
  })
  setAvailability(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAvailabilityDto) {
    return this.drivers.setAvailability(user.id, dto.availability);
  }

  @Post('location')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Joriy joylashuvni yangilash',
    description:
      'Boʻsh holatdagi haydovchi uchun past chastotali yangilanish (2 daqiqada bir marta). ' +
      'Faol buyurtma vaqtidagi kuzatuv WebSocket orqali ketadi.',
  })
  async updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLocationDto,
  ): Promise<void> {
    await this.drivers.updateLocation(user.id, dto);
  }

  @Get('routes')
  @ApiOperation({ summary: 'Ishlash yoʻnalishlarim' })
  listRoutes(@CurrentUser() user: AuthenticatedUser) {
    return this.drivers.listRoutes(user.id);
  }

  @Post('routes')
  @ApiOperation({
    summary: 'Yoʻnalish qoʻshish',
    description: 'Bir xil yoʻnalish qayta yuborilsa — yangilanadi, dublikat yaratilmaydi.',
  })
  addRoute(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddRouteDto) {
    return this.drivers.addRoute(user.id, dto);
  }

  @Delete('routes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Yoʻnalishni oʻchirish' })
  async removeRoute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.drivers.removeRoute(user.id, id);
  }
}

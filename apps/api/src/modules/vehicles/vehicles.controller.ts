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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthenticatedUser } from '@/common/decorators';

import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@ApiBearerAuth()
@Roles('DRIVER')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Post()
  @ApiOperation({
    summary: 'Transport qoʻshish',
    description:
      'Davlat raqami har qanday formatda yuborilishi mumkin — server normallashtiradi. ' +
      'Quvvat spravochnikdagi transport turi chegarasiga solishtiriladi. ' +
      'Birinchi transport avtomatik asosiy boʻladi.',
  })
  @ApiResponse({ status: 201, description: 'Qoʻshildi' })
  @ApiResponse({ status: 409, description: 'Bu davlat raqami allaqachon mavjud' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Transportlarim' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.vehicles.list(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Transport tafsilotlari' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vehicles.getById(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Transportni tahrirlash',
    description:
      'Tasdiqlangan transportda texnik parametrlarni (tur, kuzov, raqam, quvvat, hajm) ' +
      'oʻzgartirib boʻlmaydi — 409 qaytadi.',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(user.id, id, dto);
  }

  @Post(':id/primary')
  @ApiOperation({ summary: 'Asosiy transport qilib belgilash' })
  setPrimary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vehicles.setPrimary(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Transportni oʻchirish' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.vehicles.remove(user.id, id);
  }
}

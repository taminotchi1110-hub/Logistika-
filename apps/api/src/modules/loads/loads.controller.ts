import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, type AuthenticatedUser } from '@/common/decorators';

import {
  CancelLoadDto,
  CreateLoadDto,
  EstimateLoadDto,
  LoadFeedQueryDto,
  UpdateLoadDto,
} from './dto/load.dto';
import { LoadsService } from './loads.service';

@ApiTags('loads')
@ApiBearerAuth()
@Controller('loads')
export class LoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Get('estimate')
  @ApiOperation({
    summary: 'Masofa, vaqt va narx tavsiyasi',
    description:
      'Yuk yaratishdan OLDIN chaqiriladi — mijoz forma toʻldirayotganda "308 km · 4 s 20 daq · ' +
      'taxminan 2 400 000 soʻm" deb koʻrsatadi. `price.source`: `market` — real bitimlar ' +
      'medianasi, `tariff` — boshlangʻich jadval.',
  })
  estimate(@Query() dto: EstimateLoadDto) {
    return this.loads.estimate({
      from: { lat: dto.fromLat, lng: dto.fromLng },
      to: { lat: dto.toLat, lng: dto.toLng },
      weightKg: dto.weightKg,
      vehicleTypeIds: dto.vehicleTypeIds,
    });
  }

  @Get('feed')
  @Roles('DRIVER')
  @ApiOperation({
    summary: 'Haydovchi lentasi',
    description:
      'Faqat faol eʼlonlar. `lat`/`lng` yuborilsa har bir yukda `distanceToPickupKm` qaytadi ' +
      'va `sort=distance_asc` ishlaydi. Sahifalash — kursor (`meta.nextCursor`). ' +
      'Kontakt telefonlari maskalangan.',
  })
  feed(@CurrentUser() user: AuthenticatedUser, @Query() query: LoadFeedQueryDto) {
    return this.loads.feed(user.id, query);
  }

  @Get('mine')
  @Roles('SHIPPER')
  @ApiOperation({ summary: 'Mening yuklarim' })
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: LoadFeedQueryDto) {
    return this.loads.listMine(user.id, query);
  }

  @Post()
  @Roles('SHIPPER')
  @ApiOperation({
    summary: 'Yuk yaratish',
    description:
      'Masofa, vaqt va viloyatlar koordinatadan avtomatik hisoblanadi. ' +
      '`publishNow: true` — darhol eʼlon qilinadi, aks holda qoralama saqlanadi.',
  })
  @ApiResponse({ status: 201, description: 'Yaratildi' })
  @ApiResponse({ status: 409, description: 'Faol eʼlonlar limiti oshdi' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLoadDto) {
    return this.loads.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Yuk tafsilotlari',
    description:
      'Eʼlon egasi toʻliq maʼlumotni koʻradi. Haydovchi uchun kontakt telefonlari ' +
      'maskalangan — ular buyurtma tasdiqlangandan keyin ochiladi.',
  })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.loads.getPublicLoad(id, user.id);
  }

  @Patch(':id')
  @Roles('SHIPPER')
  @ApiOperation({
    summary: 'Yukni tahrirlash',
    description: 'Faqat DRAFT va PUBLISHED holatida. Manzil oʻzgarsa masofa qayta hisoblanadi.',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLoadDto,
  ) {
    return this.loads.update(user.id, id, dto);
  }

  @Post(':id/publish')
  @Roles('SHIPPER')
  @ApiOperation({
    summary: 'Qoralamani eʼlon qilish',
    description: 'Shundan keyin yuk haydovchilar lentasida koʻrinadi.',
  })
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.loads.publish(user.id, id);
  }

  @Post(':id/cancel')
  @Roles('SHIPPER')
  @ApiOperation({ summary: 'Yukni bekor qilish' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelLoadDto,
  ) {
    return this.loads.cancel(user.id, id, dto.reason);
  }

  @Delete(':id')
  @Roles('SHIPPER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Qoralamani oʻchirish' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.loads.cancel(user.id, id, 'Foydalanuvchi oʻchirdi');
  }
}

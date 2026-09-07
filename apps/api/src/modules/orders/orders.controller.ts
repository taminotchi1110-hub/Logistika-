import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  MaxLength,
} from 'class-validator';

import { CurrentUser, Roles, type AuthenticatedUser } from '@/common/decorators';

import { OffersService } from './offers.service';
import { ORDER_STATUSES, type OrderStatus } from './order-status';
import { OrdersService } from './orders.service';

export class CreateOfferDto {
  @ApiProperty({ description: 'Qaysi transport bilan bajarasiz' })
  @IsUUID()
  vehicleId!: string;

  @ApiPropertyOptional({
    example: 230_000_000,
    description: 'Oʻz narxingiz (tiyinda). Yubormasangiz eʼlon narxi olinadi.',
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  offeredPriceTiyin?: number;

  @ApiPropertyOptional({ example: 'Bugun 15:00 da yetib boraman' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;

  @ApiPropertyOptional({ example: '5 palet ortildi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ example: 41.3111, description: 'Statusni qayerda oʻzgartirdingiz' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 69.2797 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export class EmergencyRevealDto {
  @ApiProperty({ example: 'Manzilni topa olmayapman, darvoza yopiq' })
  @IsString()
  @Length(10, 300)
  reason!: string;
}

export class OrdersQueryDto {
  @ApiPropertyOptional({ description: 'true — faqat faol, false — yakunlanganlar' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

@ApiTags('orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly offers: OffersService,
  ) {}

  // ----------------------------------------------------------- takliflar

  @Post('loads/:id/offers')
  @Roles('DRIVER')
  @ApiOperation({
    summary: 'Yukka taklif yuborish',
    description:
      'Verifikatsiya yakunlangan boʻlishi shart. Taklif narxi eʼlon narxidan ±30% dan ' +
      'koʻp farq qila olmaydi ("kelishuv asosida" eʼlonlarda cheklov yoʻq). ' +
      'Bitta yukka bitta faol taklif.',
  })
  @ApiResponse({ status: 201, description: 'Taklif yuborildi' })
  @ApiResponse({ status: 409, description: 'Allaqachon taklif yuborilgan' })
  @ApiResponse({ status: 422, description: 'Verifikatsiya yakunlanmagan yoki quvvat yetmaydi' })
  createOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') loadId: string,
    @Body() dto: CreateOfferDto,
  ) {
    return this.offers.create(user.id, loadId, dto);
  }

  @Get('loads/:id/offers')
  @Roles('SHIPPER')
  @ApiOperation({ summary: 'Yukka kelgan takliflar (reyting boʻyicha)' })
  listOffers(@CurrentUser() user: AuthenticatedUser, @Param('id') loadId: string) {
    return this.offers.listForLoad(user.id, loadId);
  }

  @Get('offers/mine')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Mening takliflarim' })
  myOffers(@CurrentUser() user: AuthenticatedUser) {
    return this.offers.listMine(user.id);
  }

  @Post('offers/:id/accept')
  @Roles('SHIPPER')
  @ApiOperation({
    summary: 'Taklifni qabul qilish → buyurtma yaratiladi',
    description:
      'Bitta tranzaksiyada: buyurtma yaratiladi, yuk band boʻladi, qolgan takliflar ' +
      'rad etiladi va **CHAT OCHILADI**. Telefon raqamlari hali yopiq — ular haydovchi ' +
      'yuk olish nuqtasiga yetib borganda ochiladi.',
  })
  acceptOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') offerId: string) {
    return this.orders.acceptOffer(user.id, offerId);
  }

  @Post('offers/:id/reject')
  @Roles('SHIPPER')
  @ApiOperation({ summary: 'Taklifni rad etish' })
  async rejectOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') offerId: string) {
    await this.offers.reject(user.id, offerId);
    return { rejected: true };
  }

  @Post('offers/:id/withdraw')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Taklifni qaytarib olish' })
  async withdrawOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') offerId: string) {
    await this.offers.withdraw(user.id, offerId);
    return { withdrawn: true };
  }

  // ---------------------------------------------------------- buyurtmalar

  @Get('orders')
  @ApiOperation({ summary: 'Buyurtmalarim' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: OrdersQueryDto) {
    return this.orders.listForUser(user.id, { active: query.active });
  }

  @Get('orders/:id')
  @ApiOperation({
    summary: 'Buyurtma tafsilotlari',
    description:
      'Javobdagi `visibility` obyekti kontakt qoidalarini bildiradi: ' +
      '`counterpartyPhone` — hamkor telefoni ochiqmi, `chatEnabled` — chat ishlaydimi, ' +
      '`emergencyRevealAvailable` — "Bogʻlana olmayapman" tugmasi koʻrsatilsinmi. ' +
      'Telefon yopiq boʻlsa maskalangan holda qaytadi.',
  })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.getForUser(id, user.id);
  }

  @Post('orders/:id/status')
  @ApiOperation({
    summary: 'Buyurtma holatini oʻzgartirish',
    description:
      'State machine tekshiradi: oʻtish mumkinmi va aynan shu rol bajara oladimi. ' +
      '`ARRIVED_AT_PICKUP` ga oʻtganda **telefon raqamlari ochiladi** va ikkala ' +
      'tomonga bildirishnoma ketadi.',
  })
  @ApiResponse({ status: 409, description: 'Ruxsat etilmagan oʻtish yoki notoʻgʻri rol' })
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.orders.changeStatus(id, user.id, dto.status, {
      note: dto.note,
      lat: dto.lat,
      lng: dto.lng,
    });
  }

  @Post('orders/:id/reveal-contacts')
  @ApiOperation({
    summary: 'Favqulodda kontakt ochish',
    description:
      'Haydovchi manzilni topa olmasa yoki darvoza yopiq boʻlsa. Sabab majburiy, ' +
      'hodisa audit tarixiga yoziladi va ikkala tomonga bildirishnoma ketadi.',
  })
  revealContacts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EmergencyRevealDto,
  ) {
    return this.orders.revealContactsEmergency(id, user.id, dto.reason);
  }
}

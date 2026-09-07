import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '@/common/decorators';

import { AddressesService } from './addresses.service';

export class CreateAddressDto {
  @ApiProperty({ example: 'Ombor', description: 'Qisqa nom — roʻyxatda shu koʻrinadi' })
  @IsString()
  @Length(2, 64)
  label!: string;

  @ApiProperty({ example: 'Toshkent, Yunusobod tumani, Amir Temur koʻchasi 108' })
  @IsString()
  @Length(5, 500)
  addressText!: string;

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
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'Ortga oʻtib, 2-darvoza' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

@ApiTags('addresses')
@ApiBearerAuth()
@Controller('me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({
    summary: 'Saqlangan manzillarim',
    description: 'Eng koʻp ishlatilgani birinchi — yuk yaratishda bir tegishda tanlanadi.',
  })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Manzil saqlash',
    description: 'Viloyat va tuman koordinatadan avtomatik aniqlanadi.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAddressDto) {
    return this.addresses.create(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Manzilni oʻchirish' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.addresses.remove(user.id, id);
  }
}

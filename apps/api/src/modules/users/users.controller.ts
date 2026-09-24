import { Body, Controller, Delete, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { CurrentUser, RateLimit, type AuthenticatedUser } from '@/common/decorators';
import { maskPhone } from '@/common/utils/phone.util';

import { AccountDeletionService } from './account-deletion.service';
import { DataExportService } from './data-export.service';
import { UsersService } from './users.service';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Bobur' })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Aliyev' })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  lastName?: string;

  @ApiPropertyOptional({ enum: ['uz', 'ru', 'en'] })
  @IsOptional()
  @IsIn(['uz', 'ru', 'en'])
  lang?: 'uz' | 'ru' | 'en';

  @ApiPropertyOptional({ description: 'S3 kaliti (media/presign orqali olinadi)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatarKey?: string;
}

export class RegisterDeviceDto {
  @ApiPropertyOptional({ description: 'FCM push tokeni' })
  @IsString()
  @MaxLength(4096)
  fcmToken!: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4' })
  @IsString()
  @MaxLength(128)
  deviceId!: string;

  @ApiPropertyOptional({ enum: ['android', 'ios', 'web'] })
  @IsIn(['android', 'ios', 'web'])
  platform!: string;
}

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly accountDeletion: AccountDeletionService,
    private readonly dataExport: DataExportService,
  ) {}

  @Put('me/devices')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Qurilmani push uchun roʻyxatdan oʻtkazish',
    description:
      'Ilova har ochilganda chaqiradi — FCM tokeni oʻzgarishi mumkin. ' +
      'Bir qurilma bitta yozuv (deviceId boʻyicha yangilanadi).',
  })
  registerDevice(@CurrentUser() current: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.users.registerDevice(current.id, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Joriy foydalanuvchi profili' })
  async me(@CurrentUser() current: AuthenticatedUser) {
    const user = await this.users.getByIdOrFail(current.id);
    return this.users.toPublicProfile(user);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profilni yangilash' })
  async updateMe(@CurrentUser() current: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    const updated = await this.users.updateProfile(current.id, dto);
    return this.users.toPublicProfile(updated);
  }

  @Get('me/export')
  @ApiBearerAuth()
  // Qimmat soʻrov: oʻnlab jadval oʻqiladi. Kuniga bir necha marta yetarli
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  @ApiOperation({
    summary: 'Maʼlumotlarimning nusxasi',
    description:
      'Maxfiylik siyosatining 7-boʻlimidagi huquq: profil, transport, eʼlon va ' +
      'buyurtmalar, yozishmalar, reytinglar, moliyaviy yozuvlar va kirish tarixi ' +
      'bitta JSON faylda. Tokenlar, shifrlangan hujjat raqamlari va boshqa ' +
      'tomonlarning toʻliq telefon raqamlari kirmaydi. Soatiga 5 marta.',
  })
  exportMe(@CurrentUser() current: AuthenticatedUser) {
    return this.dataExport.exportUser(current.id);
  }

  @Delete('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Hisobni oʻchirish',
    description:
      'QAYTARIB BOʻLMAYDI. Shaxsiy maʼlumotlar tozalanadi, sessiyalar yopiladi, ' +
      'telefon raqami boʻshaydi (u bilan qaytadan roʻyxatdan oʻtish mumkin). ' +
      'Ochiq buyurtma, hamyonda qoldiq yoki kutilayotgan pul yechish boʻlsa — 409. ' +
      'Moliyaviy yozuvlar shaxssiz holda saqlanadi (qonun talabi).',
  })
  async deleteMe(@CurrentUser() current: AuthenticatedUser) {
    await this.accountDeletion.deleteAccount(current.id);
    return { deleted: true };
  }

  @Get('users/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Boshqa foydalanuvchining ommaviy profili',
    description:
      'Telefon raqami MASKALANGAN holda qaytadi. Toʻliq raqam faqat buyurtma ' +
      'tasdiqlangandan keyin, buyurtma endpointlari orqali ochiladi.',
  })
  async publicProfile(@Param('id') id: string) {
    const user = await this.users.getByIdOrFail(id);
    const profile = this.users.toPublicProfile(user);
    return { ...profile, phone: maskPhone(profile.phone) };
  }
}

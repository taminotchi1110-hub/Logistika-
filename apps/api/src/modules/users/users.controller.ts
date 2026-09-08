import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '@/common/decorators';
import { maskPhone } from '@/common/utils/phone.util';

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
  constructor(private readonly users: UsersService) {}

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

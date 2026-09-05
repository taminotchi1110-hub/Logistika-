import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
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

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

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

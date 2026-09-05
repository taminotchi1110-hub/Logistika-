import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  ClientIp,
  CurrentUser,
  Public,
  UserAgent,
  type AuthenticatedUser,
} from '@/common/decorators';

import { AuthService } from './auth.service';
import {
  CompleteProfileDto,
  RefreshTokenDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { TokenService } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SMS kod yuborish',
    description:
      'Telefon raqamga 6 xonali kod yuboradi. Cheklovlar: 1 ta / 60 s, 3 ta / soat / raqam, 10 ta / kun / IP.',
  })
  @ApiResponse({ status: 200, description: 'Kod yuborildi' })
  @ApiResponse({ status: 400, description: 'Telefon raqami notoʻgʻri' })
  @ApiResponse({ status: 429, description: 'Limit oshdi — retryAfterSeconds ga qarang' })
  requestOtp(@Body() dto: RequestOtpDto, @ClientIp() ip: string) {
    return this.auth.requestOtp(dto, ip);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kodni tasdiqlash va tizimga kirish',
    description:
      'Kod toʻgʻri boʻlsa foydalanuvchi topiladi yoki yaratiladi va sessiya ochiladi. ' +
      'isNewUser=true boʻlsa mijoz profil toʻldirish ekraniga oʻtadi.',
  })
  @ApiResponse({ status: 200, description: 'Tokenlar va foydalanuvchi maʼlumoti' })
  @ApiResponse({ status: 400, description: 'Kod notoʻgʻri yoki muddati tugagan' })
  verifyOtp(@Body() dto: VerifyOtpDto, @ClientIp() ip: string, @UserAgent() userAgent: string) {
    return this.auth.verifyOtp(dto, ip, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tokenlarni yangilash (rotation)',
    description:
      'Eski refresh token darhol bekor qilinadi. Bekor qilingan token qayta ishlatilsa ' +
      'foydalanuvchining barcha sessiyalari yopiladi (reuse detection).',
  })
  @ApiResponse({ status: 200, description: 'Yangi token juftligi' })
  @ApiResponse({ status: 401, description: 'Token yaroqsiz yoki qayta ishlatilgan' })
  refresh(@Body() dto: RefreshTokenDto, @ClientIp() ip: string, @UserAgent() userAgent: string) {
    return this.auth.refresh(dto, ip, userAgent);
  }

  @Post('profile')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Roʻyxatdan oʻtishni yakunlash',
    description: 'Ism, familiya va rol. Shundan keyin akkaunt ACTIVE holatga oʻtadi.',
  })
  completeProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: CompleteProfileDto) {
    return this.auth.completeProfile(user.id, dto);
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Joriy sessiyadan chiqish' })
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.logout(user.sessionId, user.id);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Barcha qurilmalardan chiqish',
    description: 'Barcha sessiyalar yopiladi va amaldagi access tokenlar ham kuchsizlanadi.',
  })
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.logoutAll(user.id);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Faol sessiyalar roʻyxati' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user.id);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bitta sessiyani yopish' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ): Promise<void> {
    // Egalik tekshiruvi `revokeSession` ichida: userId ham WHERE ga kiradi,
    // shuning uchun begona sessiyani yopib boʻlmaydi.
    await this.tokens.revokeSession(sessionId, user.id);
  }
}

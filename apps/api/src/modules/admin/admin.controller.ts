import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ClientIp, Public, UserAgent } from '@/common/decorators';

import { AdminAuthService } from './admin-auth.service';
import { AdminGuard, RequirePermission, type AdminRequest } from './admin.guard';
import { AdminService, type AuditContext } from './admin.service';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@karvon.uz' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Str0ng!Password' })
  @IsString()
  @Length(8, 128)
  password!: string;

  @ApiProperty({ example: '123456', description: 'Authenticator ilovasidagi kod' })
  @IsString()
  @Length(6, 6)
  totp!: string;
}

export class ReviewDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ example: 'Rasm sifati past, qayta yuklang' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'BANNED'] })
  @IsIn(['ACTIVE', 'SUSPENDED', 'BANNED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'BANNED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SettingValueDto {
  @ApiProperty({ description: 'Yangi qiymat (JSON)', example: 0.05 })
  // `@Allow()` MAJBURIY: ValidationPipe `whitelist: true` bilan ishlaydi va
  // hech qanday dekoratorsiz maydonni OLIB TASHLAYDI. Bu yerda qiymat
  // ixtiyoriy turda (son, satr, obyekt, massiv), shuning uchun tur
  // tekshiruvi yoʻq — lekin maydon roʻyxatga kiritilishi shart.
  @Allow()
  value!: unknown;
}

export class PayoutActionDto {
  @ApiPropertyOptional({ example: 'BANK-2026-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(96)
  providerTxnId?: string;

  @ApiPropertyOptional({ example: 'Karta raqami notoʻgʻri' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ComplaintActionDto {
  @ApiProperty({ enum: ['IN_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED'] })
  @IsIn(['IN_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED'])
  status!: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED' | 'ESCALATED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}

const ORDER_STATUSES = [
  'ASSIGNED',
  'CONFIRMED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'ARRIVED_AT_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CLOSED',
  'DISPUTED',
  'CANCELLED_BY_SHIPPER',
  'CANCELLED_BY_DRIVER',
  'CANCELLED_BY_ADMIN',
] as const;

export class OrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsIn(ORDER_STATUSES)
  status!: string;

  @ApiProperty({ example: 'Haydovchi aloqaga chiqmadi, mijoz bekor qilishni soʻradi' })
  // SABAB MAJBURIY va boʻsh boʻlishi mumkin emas. Server uni status
  // tarixiga yozadi va u NIZODA asosiy dalil: "nega admin buyurtmani
  // bekor qilgan?" degan savolga javob shu yerdan olinadi. `@Length`
  // minimumi 5 — "ok" yoki "." bilan qutulib boʻlmasin.
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class OrdersQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  // Roʻyxat SQL enumiga toʻgʻridan-toʻgʻri boradi: tekshirilmasa
  // notoʻgʻri qiymat 500 beradi
  @IsIn(ORDER_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: '1042', description: 'Buyurtma raqami yoki telefon' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * Shikoyat filtri.
 *
 * Avval `@Query('status') status?: string` edi — hech qanday tekshiruv
 * yoʻq. Notoʻgʻri qiymat toʻgʻridan-toʻgʻri SQL enumiga borib, 500
 * qaytarardi. Endi roʻyxatdan tashqari qiymat 400 va sabab aytiladi.
 */
export class ComplaintsQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED'] })
  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED'])
  status?: string;
}

/**
 * Audit jurnali filtri.
 *
 * ALOHIDA DTO KERAK. Avval bu yerda `ListQueryDto & { action?: string }`
 * turgan edi — TypeScript darajasida toʻgʻri koʻrinadi, lekin
 * `ValidationPipe` DTO SINFINING dekoratorlariga qaraydi, tur
 * kesishmasiga emas. `ListQueryDto` da `action` maydoni yoʻq va
 * `forbidNonWhitelisted: true` bilan `?action=user.ban` soʻrovi 400
 * qaytarardi: hujjatda va'da qilingan filtr umuman ishlamas edi.
 */
export class AuditQueryDto {
  @ApiPropertyOptional({ example: 'user.ban', description: 'Amal turi' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @ApiPropertyOptional({ description: 'Faqat shu adminning amallari' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  adminId?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class SeriesQueryDto {
  @ApiPropertyOptional({ example: 30, description: 'Necha kunlik oraliq (1–90)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // 90 kun — yuqori chegara. Cheksiz oraliq butun `orders` jadvalini
  // skanerlashga aylanadi va admin paneli bazani sekinlashtira oladi
  @Max(90)
  days?: number;
}

export class ListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * Admin paneli API.
 *
 * `@Public()` — global JWT guard bu marshrutlarni tekshirmasligi uchun.
 * Himoyani `AdminGuard` beradi: u boshqa token turini, boshqa kalitni va
 * huquqlarni tekshiradi.
 */
@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly admin: AdminService,
  ) {}

  private context(request: AdminRequest, ip: string, userAgent: string): AuditContext {
    return { adminId: request.admin?.adminId ?? '', ip, userAgent };
  }

  // ---------------------------------------------------------- kirish

  @Public()
  @Post('auth/login')
  @ApiOperation({
    summary: 'Admin kirishi',
    description:
      'Email + parol + TOTP. Ikki faktor MAJBURIY. 5 marta notoʻgʻri urinishdan ' +
      'keyin akkaunt 15 daqiqaga bloklanadi.',
  })
  login(@Body() dto: AdminLoginDto, @ClientIp() ip: string) {
    return this.auth.login({ ...dto, ip });
  }

  @Public()
  @UseGuards(AdminGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Joriy admin' })
  me(@Req() request: AdminRequest) {
    return request.admin;
  }

  // ------------------------------------------------------ boshqaruv paneli

  @Public()
  @UseGuards(AdminGuard)
  @Get('dashboard')
  @ApiBearerAuth()
  @RequirePermission('dashboard.view')
  @ApiOperation({
    summary: 'Boshqaruv paneli koʻrsatkichlari',
    description: 'Foydalanuvchilar, buyurtmalar, daromad va navbatdagi tekshiruvlar.',
  })
  dashboard() {
    return this.admin.dashboard();
  }

  @Public()
  @UseGuards(AdminGuard)
  @Get('dashboard/series')
  @ApiBearerAuth()
  @RequirePermission('dashboard.view')
  @ApiOperation({
    summary: 'Kunlik dinamika (grafiklar uchun)',
    description:
      'Buyurtmalar, bekor qilinganlar, yakunlanganlar va GMV — kun boʻyicha. Buyurtma ' +
      'boʻlmagan kunlar NOL bilan toʻldiriladi: tushib qolgan kun grafikda pasayishni ' +
      'yashirardi. Sanalar Toshkent vaqti boʻyicha.',
  })
  dashboardSeries(@Query() query: SeriesQueryDto) {
    return this.admin.dashboardSeries(query.days ?? 30);
  }

  // ------------------------------------------------------- verifikatsiya

  @Public()
  @UseGuards(AdminGuard)
  @Get('verifications')
  @ApiBearerAuth()
  @RequirePermission('docs.verify')
  @ApiOperation({
    summary: 'Tekshirish navbati',
    description: 'Hujjatlar, haydovchilar va transportlar — eng eskisi birinchi (FIFO).',
  })
  queue() {
    return this.admin.verificationQueue();
  }

  @Public()
  @UseGuards(AdminGuard)
  @Get('documents/:id/url')
  @ApiBearerAuth()
  @RequirePermission('docs.verify')
  @ApiOperation({
    summary: 'Hujjatni koʻrish havolasi',
    description:
      'Qisqa muddatli imzolangan havola (5 daqiqa). **Har bir ochish audit jurnaliga ' +
      'yoziladi** — hujjatda pasport raqami va PINFL boʻladi. Navbat javobida havola ' +
      'berilmaydi: roʻyxatni ochish 50 ta hujjatni koʻrish bilan bir xil boʻlib qolardi.',
  })
  documentUrl(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    return this.admin.documentViewUrl(this.context(request, ip, userAgent), id);
  }

  @Public()
  @UseGuards(AdminGuard)
  @Post('documents/:id/review')
  @ApiBearerAuth()
  @RequirePermission('docs.verify')
  @ApiOperation({ summary: 'Hujjatni tasdiqlash yoki rad etish' })
  async reviewDocument(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.verifyDocument(this.context(request, ip, userAgent), id, dto.approve, dto.reason);
    return { ok: true };
  }

  @Public()
  @UseGuards(AdminGuard)
  @Post('drivers/:id/review')
  @ApiBearerAuth()
  @RequirePermission('docs.verify')
  @ApiOperation({ summary: 'Haydovchi verifikatsiyasi' })
  async reviewDriver(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.verifyDriver(this.context(request, ip, userAgent), id, dto.approve, dto.reason);
    return { ok: true };
  }

  @Public()
  @UseGuards(AdminGuard)
  @Post('vehicles/:id/review')
  @ApiBearerAuth()
  @RequirePermission('docs.verify')
  @ApiOperation({ summary: 'Transport verifikatsiyasi' })
  async reviewVehicle(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.verifyVehicle(this.context(request, ip, userAgent), id, dto.approve, dto.reason);
    return { ok: true };
  }

  // ------------------------------------------------------ foydalanuvchilar

  @Public()
  @UseGuards(AdminGuard)
  @Get('users')
  @ApiBearerAuth()
  @RequirePermission('users.view')
  @ApiOperation({ summary: 'Foydalanuvchilar roʻyxati' })
  users(@Query() query: ListQueryDto) {
    return this.admin.listUsers(query);
  }

  @Public()
  @UseGuards(AdminGuard)
  @Get('users/:id')
  @ApiBearerAuth()
  @RequirePermission('users.view')
  @ApiOperation({ summary: 'Foydalanuvchi tafsilotlari' })
  user(@Param('id') id: string) {
    return this.admin.userDetail(id);
  }

  @Public()
  @UseGuards(AdminGuard)
  @Post('users/:id/status')
  @ApiBearerAuth()
  @RequirePermission('users.ban')
  @ApiOperation({
    summary: 'Foydalanuvchi holatini oʻzgartirish',
    description:
      'Bloklashda barcha sessiyalar DARHOL bekor qilinadi (`token_version` oshiriladi) — ' +
      'token muddati tugagunicha kutilmaydi.',
  })
  async setStatus(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: UserStatusDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.setUserStatus(this.context(request, ip, userAgent), id, dto.status, dto.reason);
    return { ok: true };
  }

  // ------------------------------------------------------------- moliya

  @Public()
  @UseGuards(AdminGuard)
  @Get('payouts')
  @ApiBearerAuth()
  @RequirePermission('payments.view')
  @ApiOperation({ summary: 'Kutilayotgan pul yechish soʻrovlari' })
  payouts() {
    return this.admin.pendingPayouts();
  }

  @Public()
  @UseGuards(AdminGuard)
  @Post('payouts/:id/complete')
  @ApiBearerAuth()
  @RequirePermission('payouts.process')
  @ApiOperation({ summary: 'Yechishni bajarilgan deb belgilash' })
  async completePayout(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: PayoutActionDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.completePayout(
      this.context(request, ip, userAgent),
      id,
      dto.providerTxnId ?? 'MANUAL',
    );
    return { ok: true };
  }

  @Public()
  @UseGuards(AdminGuard)
  @Post('payouts/:id/reject')
  @ApiBearerAuth()
  @RequirePermission('payouts.process')
  @ApiOperation({
    summary: 'Yechishni rad etish',
    description: 'Pul haydovchi hamyoniga qaytariladi.',
  })
  async rejectPayout(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: PayoutActionDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.rejectPayout(
      this.context(request, ip, userAgent),
      id,
      dto.reason ?? 'Sabab koʻrsatilmagan',
    );
    return { ok: true };
  }

  @Public()
  @UseGuards(AdminGuard)
  @Get('ledger/integrity')
  @ApiBearerAuth()
  @RequirePermission('payments.view')
  @ApiOperation({
    summary: 'Ledger butunligi',
    description:
      'Hisob balansi yozuvlar yigʻindisiga mos keladimi. Natija boʻsh boʻlmasa — ' +
      'darhol tekshirish kerak boʻlgan jiddiy holat.',
  })
  integrity() {
    return this.admin.ledgerIntegrity();
  }

  // -------------------------------------------------------- buyurtmalar

  @Public()
  @UseGuards(AdminGuard)
  @Get('orders')
  @ApiBearerAuth()
  @RequirePermission('orders.view')
  @ApiOperation({
    summary: 'Buyurtmalar roʻyxati',
    description:
      'Telefon raqamlari YASHIRILGAN holda qaytadi. Haqiqiy raqamlar uchun ' +
      '`GET /admin/orders/:id/contacts` — u har bir ochilishni audit jurnaliga yozadi.',
  })
  orders(@Query() query: OrdersQueryDto) {
    return this.admin.listOrders({
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
  }

  @Public()
  @UseGuards(AdminGuard)
  @Get('orders/:id')
  @ApiBearerAuth()
  @RequirePermission('orders.view')
  @ApiOperation({
    summary: 'Buyurtma tafsiloti va status tarixi',
    description: 'Telefon raqamlari yashirilgan. Moliya bir joyda: narx, komissiya, jarima.',
  })
  orderDetail(@Param('id') id: string) {
    return this.admin.orderDetail(id);
  }

  @Public()
  @UseGuards(AdminGuard)
  @Get('orders/:id/contacts')
  @ApiBearerAuth()
  @RequirePermission('orders.view')
  @ApiOperation({
    summary: 'Haqiqiy telefon raqamlari',
    description:
      'HAR BIR OCHISH audit jurnaliga yoziladi. Roʻyxatda raqamlar yashirilgan: aks holda ' +
      'roʻyxatni ochgan xodim bir zumda yuzlab raqamni koʻrardi va ularning tashqariga ' +
      'chiqishi hech qanday iz qoldirmasdi.',
  })
  orderContacts(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    return this.admin.orderContacts(this.context(request, ip, userAgent), id);
  }

  @Public()
  @UseGuards(AdminGuard)
  @Get('orders/:id/chat')
  @ApiBearerAuth()
  @RequirePermission('chat.view')
  @ApiOperation({
    summary: 'Buyurtma yozishmasi',
    description:
      'Nizolarda asosiy dalil. Alohida huquq (`chat.view`) — moliyachi yoki moderatorga ' +
      'begonalarning yozishmasini oʻqish kerak emas. Oʻqish auditga yoziladi.',
  })
  orderChat(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    return this.admin.orderChat(this.context(request, ip, userAgent), id);
  }

  @Public()
  @UseGuards(AdminGuard)
  @Post('orders/:id/status')
  @ApiBearerAuth()
  @RequirePermission('orders.force_status')
  @ApiOperation({
    summary: 'Buyurtma holatini oʻzgartirish',
    description:
      'Holat grafigi CHETLAB OʻTILMAYDI — u moliya va kuzatuvni himoya qiladi. Admin uchun ' +
      'grafik allaqachon kengroq: `CANCELLED_BY_ADMIN` deyarli hamma holatdan mumkin va ' +
      'nizoni yopish ham. **Sabab majburiy**: u status tarixiga ham, audit jurnaliga ham ' +
      'tushadi va ikkala tomonga bildirishnoma yuboriladi.',
  })
  async forceOrderStatus(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: OrderStatusDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.changeOrderStatus(
      this.context(request, ip, userAgent),
      id,
      dto.status,
      dto.reason,
    );
    return { ok: true };
  }

  // --------------------------------------------------------- sozlamalar

  @Public()
  @UseGuards(AdminGuard)
  @Get('settings')
  @ApiBearerAuth()
  @RequirePermission('settings.view')
  @ApiOperation({ summary: 'Platforma sozlamalari' })
  settings() {
    return this.admin.listSettings();
  }

  @Public()
  @UseGuards(AdminGuard)
  @Put('settings/:key')
  @ApiBearerAuth()
  @RequirePermission('settings.update')
  @ApiOperation({
    summary: 'Sozlamani oʻzgartirish',
    description:
      'Komissiya, matching ogʻirliklari, jarima — hammasi shu yerdan. ' +
      'Kodni qayta yigʻish shart emas. Har oʻzgarish auditga yoziladi.',
  })
  async updateSetting(
    @Req() request: AdminRequest,
    @Param('key') key: string,
    @Body() dto: SettingValueDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.updateSetting(this.context(request, ip, userAgent), key, dto.value);
    return { ok: true };
  }

  // -------------------------------------------------------- shikoyatlar

  @Public()
  @UseGuards(AdminGuard)
  @Get('complaints')
  @ApiBearerAuth()
  @RequirePermission('complaints.view')
  @ApiOperation({ summary: 'Shikoyatlar — eng muhimi birinchi' })
  complaints(@Query() query: ComplaintsQueryDto) {
    return this.admin.listComplaints(query.status);
  }

  @Public()
  @UseGuards(AdminGuard)
  @Post('complaints/:id/resolve')
  @ApiBearerAuth()
  @RequirePermission('complaints.resolve')
  @ApiOperation({ summary: 'Shikoyatni koʻrib chiqish' })
  async resolveComplaint(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ComplaintActionDto,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ) {
    await this.admin.resolveComplaint(
      this.context(request, ip, userAgent),
      id,
      dto.status,
      dto.resolution,
    );
    return { ok: true };
  }

  // ------------------------------------------------------------- audit

  @Public()
  @UseGuards(AdminGuard)
  @Get('audit-logs')
  @ApiBearerAuth()
  @RequirePermission('audit.view')
  @ApiOperation({
    summary: 'Audit jurnali',
    description: 'Har bir admin amali: kim, qachon, nima, oldin va keyin qanday edi.',
  })
  auditLogs(@Query() query: AuditQueryDto) {
    return this.admin.auditLogs({
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.adminId ? { adminId: query.adminId } : {}),
    });
  }
}

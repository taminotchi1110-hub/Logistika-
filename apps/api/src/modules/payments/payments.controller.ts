import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { CurrentUser, Roles, type AuthenticatedUser } from '@/common/decorators';
import { formatSoum, toTiyin } from '@/common/utils/money.util';
import type { Env } from '@/config/env.schema';
import type { PspProvider } from '@/infra/database/database.types';

import { EscrowService } from './escrow.service';
import { LedgerService } from './ledger.service';
import { PaymentsService } from './payments.service';
import { PayoutsService } from './payouts.service';

export class TopupDto {
  @ApiProperty({ example: 50000, description: 'Summa SOʻMDA (tiyinda emas)' })
  @Type(() => Number)
  @IsInt()
  @Min(5_000)
  @Max(50_000_000)
  amountSoum!: number;

  @ApiProperty({ enum: ['CLICK', 'PAYME'] })
  @IsIn(['CLICK', 'PAYME'])
  provider!: PspProvider;
}

export class PayoutRequestDto {
  @ApiProperty({ example: 200000, description: 'Summa SOʻMDA' })
  @Type(() => Number)
  @IsInt()
  @Min(10_000)
  amountSoum!: number;

  @ApiProperty({ example: '8600123456781234', description: 'Karta raqami' })
  @IsString()
  @MaxLength(20)
  cardNumber!: string;
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Shu vaqtdan oldingi yozuvlar (ISO)' })
  @IsOptional()
  @IsString()
  before?: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  private readonly allowSimulation: boolean;

  constructor(
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
    private readonly escrow: EscrowService,
    private readonly payouts: PayoutsService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.allowSimulation = config.get('PAYMENTS_ALLOW_SIMULATION', { infer: true });
  }

  // ------------------------------------------------------------ hamyon

  @Get('wallet')
  @ApiOperation({
    summary: 'Hamyon balansi',
    description:
      'Balans TIYINDA qaytadi (1 soʻm = 100 tiyin). `formatted` — koʻrsatish uchun tayyor matn. ' +
      'Haydovchida balans manfiy boʻlishi mumkin: naqd buyurtmalarda komissiya shu yerdan yechiladi.',
  })
  async wallet(@CurrentUser() user: AuthenticatedUser) {
    const balance = await this.ledger.balance(user.id);
    const status = await this.escrow.canDriverTakeOrders(user.id);

    return {
      ...balance,
      formatted: formatSoum(balance.balanceTiyin),
      canTakeOrders: status.allowed,
      debtToPayTiyin: status.debtToPayTiyin,
    };
  }

  @Get('wallet/history')
  @ApiOperation({
    summary: 'Hamyon harakatlari',
    description: 'Har bir yozuvda amaldan keyingi balans ham bor — mijoz hisobni tekshira oladi.',
  })
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: HistoryQueryDto) {
    return this.ledger.history(user.id, query);
  }

  // ----------------------------------------------------------- toʻlov

  @Post('payments/topup')
  @ApiOperation({
    summary: 'Hamyonni toʻldirish',
    description:
      'Toʻlov yozuvi yaratiladi va PSP sahifasiga havola qaytadi. Pul faqat ' +
      'PSP tasdiqlagandan keyin qoʻshiladi — havolani ochmasdan balans oshmaydi.',
  })
  topup(@CurrentUser() user: AuthenticatedUser, @Body() dto: TopupDto) {
    return this.payments.createTopup(user.id, {
      amountTiyin: BigInt(dto.amountSoum) * 100n,
      provider: dto.provider,
    });
  }

  @Get('payments')
  @ApiOperation({ summary: 'Toʻlovlarim' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.payments.listMine(user.id);
  }

  @Post('payments/:id/simulate-paid')
  @ApiOperation({
    summary: 'Toʻlovni qoʻlda tasdiqlash (FAQAT DEV)',
    description:
      'PSP kalitlarisiz ishlab chiqish uchun. `PAYMENTS_ALLOW_SIMULATION=true` ' +
      'boʻlmasa 403 qaytaradi — ishlab chiqarishda hech qachon yoqilmaydi.',
  })
  async simulate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!this.allowSimulation) {
      throw new ForbiddenException('Simulyatsiya oʻchirilgan');
    }

    const payment = await this.payments.getById(id);
    // Begona toʻlovni tasdiqlab boʻlmaydi — dev rejimida ham
    if (!payment || payment.userId !== user.id) {
      throw new ForbiddenException('Toʻlov topilmadi');
    }

    return this.payments.markPaid(id, { providerTxnId: `sim-${Date.now()}` });
  }

  // ---------------------------------------------------------- yechish

  @Post('payouts')
  @Roles('DRIVER')
  @ApiOperation({
    summary: 'Pul yechish soʻrovi',
    description:
      'Karta raqami SAQLANMAYDI — faqat maskalangan koʻrinish va PSP tokeni. ' +
      'Summa darhol hamyondan yechiladi va PAYOUT_PAYABLE hisobiga oʻtadi.',
  })
  request(@CurrentUser() user: AuthenticatedUser, @Body() dto: PayoutRequestDto) {
    return this.payouts.request(user.id, {
      amountTiyin: BigInt(dto.amountSoum) * 100n,
      cardNumber: dto.cardNumber,
    });
  }

  @Get('payouts')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Yechish soʻrovlarim' })
  listPayouts(@CurrentUser() user: AuthenticatedUser) {
    return this.payouts.listMine(user.id);
  }

  // ------------------------------------------------------- buyurtma toʻlovi

  @Get('orders/:id/payment')
  @ApiOperation({
    summary: 'Buyurtma toʻlovi holati',
    description: 'Escrow bloklanganmi, komissiya qancha, haydovchi qancha oladi.',
  })
  async orderPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const order = await this.payouts.orderPaymentView(id, user.id);

    return {
      ...order,
      priceFormatted: formatSoum(toTiyin(order.priceTiyin)),
      commissionFormatted: formatSoum(toTiyin(order.commissionTiyin)),
      payoutFormatted: formatSoum(toTiyin(order.driverPayoutTiyin)),
    };
  }
}

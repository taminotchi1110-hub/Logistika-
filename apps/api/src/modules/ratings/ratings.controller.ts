import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '@/common/decorators';

import { RatingsService } from './ratings.service';

export class SubmitRatingDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional({ example: 5, description: 'Vaqtida yetkazish' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  punctuality?: number;

  @ApiPropertyOptional({ example: 4, description: 'Muomala' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Yuk holati — faqat mijozdan haydovchiga',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  cargoCondition?: number;

  @ApiPropertyOptional({ example: 5, description: 'Ishonchlilik' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  reliability?: number;

  @ApiPropertyOptional({ example: 'Vaqtida yetkazdi, yuk butun holda' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

@ApiTags('ratings')
@ApiBearerAuth()
@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post('orders/:id/rating')
  @ApiOperation({
    summary: 'Baho berish',
    description:
      'Baho KOʻR-KOʻRONA: hamkor ham baho bermaguncha yashirin turadi. ' +
      'Bu oʻch olish maqsadidagi past baholarning oldini oladi. ' +
      '14 kun ichida hamkor javob bermasa, baho baribir ochiladi.',
  })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitRatingDto,
  ) {
    return this.ratings.submit(id, user.id, dto);
  }

  @Get('orders/:id/ratings')
  @ApiOperation({
    summary: 'Buyurtma baholari',
    description: 'Oʻz bahongizni har doim koʻrasiz, hamkorniki — ochilgandan keyin.',
  })
  forOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ratings.forOrder(id, user.id);
  }

  @Get('me/ratings/pending')
  @ApiOperation({
    summary: 'Baho kutayotgan buyurtmalar',
    description: 'Ilova shu roʻyxatdan eslatma chiqaradi. Muddati oʻtganlari kirmaydi.',
  })
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.ratings.pending(user.id);
  }

  @Get('users/:id/ratings')
  @ApiOperation({
    summary: 'Foydalanuvchi baholari',
    description: 'Faqat ochilgan baholar. Profil sahifasida koʻrsatiladi.',
  })
  forUser(@Param('id') id: string) {
    return this.ratings.listForUser(id);
  }
}

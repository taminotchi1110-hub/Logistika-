import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { CurrentUser, Roles, type AuthenticatedUser } from '@/common/decorators';

import { MatchingService } from './matching.service';

export class MatchesQueryDto {
  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@ApiTags('matching')
@ApiBearerAuth()
@Controller('loads')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get(':id/matches')
  @Roles('SHIPPER')
  @ApiOperation({
    summary: 'Yuk uchun topilgan haydovchilar',
    description:
      'Match Score bo‘yicha tartiblangan. Ro‘yxat bo‘sh bo‘lsa — e‘lon shartlari ' +
      'haqiqatga mos emas (narx past yoki transport talabi juda tor).',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: MatchesQueryDto,
  ) {
    return this.matching.listForLoad(user.id, id, query.limit);
  }

  @Post(':id/rematch')
  @Roles('SHIPPER')
  @ApiOperation({
    summary: 'Matchingni qayta ishga tushirish',
    description:
      'Narx yoki shartlar o‘zgartirilgandan keyin foydali. Avval xabar ' +
      'yuborilgan haydovchilarga qayta push ketmaydi.',
  })
  async rematch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // Egalik tekshiruvi listForLoad ichida — begona yuk 404 qaytaradi
    await this.matching.listForLoad(user.id, id, 1);
    const ranked = await this.matching.runForLoad(id);

    return {
      candidates: ranked.length,
      topScore: ranked[0]?.score ?? null,
    };
  }
}

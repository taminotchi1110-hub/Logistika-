import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '@/common/decorators';
import type { MessageType } from '@/infra/database/database.types';

import { ChatService } from './chat.service';

export class SendMessageDto {
  @ApiPropertyOptional({ enum: ['TEXT', 'IMAGE', 'FILE'], default: 'TEXT' })
  @IsOptional()
  @IsIn(['TEXT', 'IMAGE', 'FILE'])
  type?: MessageType;

  @ApiPropertyOptional({ example: 'Qachon yetib kelasiz?' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional({ description: 'media/presign dan olingan fileKey' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachmentKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  attachmentName?: string;

  @ApiPropertyOptional({ description: 'Mijozdagi vaqtinchalik ID (optimistik UI uchun)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMsgId?: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * REST — WebSocket ishlamagan holat uchun zaxira (korporativ tarmoqlar,
 * eski Android'lar). Asosiy oqim WebSocket orqali ketadi.
 */
@ApiTags('chat')
@ApiBearerAuth()
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({
    summary: 'Suhbatlarim',
    description: 'Oxirgi xabar va oʻqilmaganlar soni bilan. `canWrite` — yozish mumkinmi.',
  })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listConversations(user.id);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'Suhbat xabarlari',
    description: 'Eng yangisi birinchi, kursor bilan sahifalanadi.',
  })
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.chat.listMessages(id, user.id, query);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Xabar yuborish (REST zaxira)',
    description:
      'Asosiy yoʻl — WebSocket `chat:message`. Bu endpoint WS ishlamagan holat uchun. ' +
      'Qabul qiluvchiga bildirishnoma ikkala holatda ham bir xil yuboriladi.',
  })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.sendMessage(id, user.id, dto);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Oʻqilgan deb belgilash' })
  read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.chat.markRead(id, user.id);
  }
}

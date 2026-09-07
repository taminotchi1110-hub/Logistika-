import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '@/common/decorators';
import type { DocumentType, OwnerType } from '@/infra/database/database.types';

import { DocumentsService } from './documents.service';

const OWNER_TYPES: OwnerType[] = ['USER', 'DRIVER', 'VEHICLE', 'LOAD', 'ORDER', 'COMPANY'];
const DOCUMENT_TYPES: DocumentType[] = [
  'PASSPORT',
  'ID_CARD',
  'DRIVER_LICENSE',
  'VEHICLE_REG',
  'INSURANCE',
  'CARGO_DOC',
  'WAYBILL',
  'CONTRACT',
  'POD',
  'POP',
  'SIGNATURE',
  'OTHER',
];

export class CreateDocumentDto {
  @ApiProperty({ enum: OWNER_TYPES })
  @IsIn(OWNER_TYPES)
  ownerType!: OwnerType;

  @ApiProperty({ description: 'USER/DRIVER uchun — oʻz ID’ingiz; VEHICLE uchun — transport ID' })
  @IsUUID()
  ownerId!: string;

  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  type!: DocumentType;

  @ApiProperty({ description: 'media/presign javobidagi fileKey' })
  @IsString()
  @MaxLength(255)
  fileKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  fileName?: string;

  @ApiPropertyOptional({ enum: ['FRONT', 'BACK'], description: 'Pasport/guvohnoma tomoni' })
  @IsOptional()
  @IsIn(['FRONT', 'BACK'])
  pageSide?: 'FRONT' | 'BACK';

  @ApiPropertyOptional({ example: '2030-01-01', description: 'Amal qilish muddati' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ enum: OWNER_TYPES })
  @IsOptional()
  @IsIn(OWNER_TYPES)
  ownerType?: OwnerType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Yuklangan faylni hujjat sifatida qayd etish',
    description:
      'Oldin `POST /media/presign` → faylni S3 ga PUT → shu yerga `fileKey` yuboriladi. ' +
      'Server fayl haqiqatan mavjudligini S3 dan tekshiradi.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDocumentDto) {
    return this.documents.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Hujjatlarim',
    description:
      'Parametrsiz — barcha hujjatlaringiz (oʻzingiz va transportlaringiz). ' +
      '`ownerType` + `ownerId` bilan — aniq obyektning hujjatlari.',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDocumentsQueryDto) {
    if (query.ownerType && query.ownerId) {
      return this.documents.listByOwner(user.id, query.ownerType, query.ownerId);
    }
    return this.documents.listMine(user.id);
  }

  @Get('readiness')
  @ApiOperation({
    summary: 'Haydovchi hujjatlari tayyorligi',
    description: 'Mobil ilova roʻyxatdan oʻtish jarayonida qaysi qadam qolganini shundan biladi.',
  })
  readiness(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.getDriverDocumentReadiness(user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hujjatni oʻchirish (tasdiqlanmagani)' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.documents.remove(user.id, id);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Public } from '@/common/decorators';

import { ReferenceService } from './reference.service';

@ApiTags('reference')
@Controller('reference')
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Public()
  @Get('all')
  @ApiOperation({
    summary: 'Barcha spravochniklar bitta soʻrovda',
    description:
      'Viloyat/tuman, transport turlari, kuzov turlari, yuk kategoriyalari va maxsus talablar. ' +
      'Nomlar uch tilda qaytadi — mobil ilova lokal saqlaydi va oflaynda ham ishlaydi. ' +
      'Mijoz oldingi `version` ni yuborsa va oʻzgarish boʻlmasa `changed:false` qaytadi.',
  })
  @ApiQuery({ name: 'version', required: false, description: 'Mijozdagi versiya hash' })
  async all(@Query('version') clientVersion?: string) {
    const bundle = await this.reference.getBundle();

    if (clientVersion && clientVersion === bundle.version) {
      // Tarmoqni tejaymiz: 40 KB oʻrniga bir necha bayt
      return { version: bundle.version, changed: false };
    }

    return { ...bundle, changed: true };
  }

  @Public()
  @Get('regions')
  @ApiOperation({ summary: 'Viloyatlar va tumanlar' })
  async regions() {
    const bundle = await this.reference.getBundle();
    return bundle.regions;
  }

  @Public()
  @Get('vehicle-types')
  @ApiOperation({ summary: 'Transport turlari' })
  async vehicleTypes() {
    const bundle = await this.reference.getBundle();
    return bundle.vehicleTypes;
  }

  @Public()
  @Get('body-types')
  @ApiOperation({ summary: 'Kuzov turlari' })
  async bodyTypes() {
    const bundle = await this.reference.getBundle();
    return bundle.bodyTypes;
  }

  @Public()
  @Get('cargo-categories')
  @ApiOperation({ summary: 'Yuk kategoriyalari' })
  async cargoCategories() {
    const bundle = await this.reference.getBundle();
    return bundle.cargoCategories;
  }
}

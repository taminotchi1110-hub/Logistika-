import { Module } from '@nestjs/common';

import { AccountDeletionService } from './account-deletion.service';
import { DataExportService } from './data-export.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AccountDeletionService, DataExportService],
  exports: [UsersService],
})
export class UsersModule {}

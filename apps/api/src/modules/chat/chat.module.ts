import { Module } from '@nestjs/common';

import { AuthModule } from '@/modules/auth/auth.module';
import { TrackingModule } from '@/modules/tracking/tracking.module';

import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, TrackingModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}

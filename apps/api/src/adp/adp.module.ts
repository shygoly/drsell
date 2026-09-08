import { Module } from '@nestjs/common';
import { QuotaModule } from '../quota/quota.module';
import { ConversationModule } from '../conversation/conversation.module';
import { AdpService } from './adp.service';
import { AdpController } from './adp.controller';

@Module({
  imports: [QuotaModule, ConversationModule],
  providers: [AdpService],
  controllers: [AdpController],
  exports: [AdpService],
})
export class AdpModule {}

import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AdpModule } from '../adp/adp.module';
import { ConversationModule } from '../conversation/conversation.module';
import { PublicStorefrontService } from './public-storefront.service';
import { PublicStorefrontController } from './public-storefront.controller';

@Module({
  imports: [TenantModule, AdpModule, ConversationModule],
  providers: [PublicStorefrontService],
  controllers: [PublicStorefrontController],
})
export class PublicStorefrontModule {}

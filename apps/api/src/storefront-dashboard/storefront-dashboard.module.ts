import { Module } from '@nestjs/common';
import { QuotaModule } from '../quota/quota.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipModule } from '../membership/membership.module';
import { ConversationModule } from '../conversation/conversation.module';
import { StorefrontDashboardController } from './storefront-dashboard.controller';
import { StorefrontDashboardService } from './storefront-dashboard.service';

@Module({
  imports: [PrismaModule, MembershipModule, QuotaModule, ConversationModule],
  controllers: [StorefrontDashboardController],
  providers: [StorefrontDashboardService],
})
export class StorefrontDashboardModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { MembershipService } from './membership.service';
import { MembershipController } from './membership.controller';
import { ShopScopeService } from '../common/shop-scope.service';

@Module({
  imports: [PrismaModule, AuthModule, TenantModule, SubscriptionModule],
  providers: [MembershipService, ShopScopeService],
  controllers: [MembershipController],
  exports: [MembershipService, ShopScopeService],
})
export class MembershipModule {}

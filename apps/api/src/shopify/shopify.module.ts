import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdpModule } from '../adp/adp.module';
import { MembershipModule } from '../membership/membership.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ShopifyService } from './shopify.service';
import { ShopifyController } from './shopify.controller';

@Module({
  imports: [
    AuthModule,
    TenantModule,
    AdpModule,
    MembershipModule,
    SubscriptionModule,
  ],
  providers: [ShopifyService],
  controllers: [ShopifyController],
  exports: [ShopifyService],
})
export class ShopifyModule {}

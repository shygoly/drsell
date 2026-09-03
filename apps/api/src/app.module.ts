import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { ShopifyModule } from './shopify/shopify.module';
import { AdpModule } from './adp/adp.module';
import { PublicStorefrontModule } from './public-storefront/public-storefront.module';
import { StorefrontDashboardModule } from './storefront-dashboard/storefront-dashboard.module';
import { MembershipModule } from './membership/membership.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { OpsModule } from './ops/ops.module';
import { HealthController } from './health.controller';

/** MVP: Subscription / Mail / Admin deferred — see docs/MVP_SCOPE.md */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantModule,
    ShopifyModule,
    AdpModule,
    PublicStorefrontModule,
    StorefrontDashboardModule,
    MembershipModule,
    SubscriptionModule,
    OpsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

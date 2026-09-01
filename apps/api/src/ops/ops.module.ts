import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ShopifyModule } from '../shopify/shopify.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuditInterceptor } from './audit.interceptor';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { SubscriptionMirrorService } from './subscription-mirror.service';

@Module({
  imports: [
    SubscriptionModule,
    ShopifyModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'drsell-dev-secret-change-me',
    }),
  ],
  controllers: [OpsController],
  providers: [OpsService, SubscriptionMirrorService, AuditInterceptor],
})
export class OpsModule {}

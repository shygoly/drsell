import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdpModule } from '../adp/adp.module';
import { ShopifyService } from './shopify.service';
import { ShopifyController } from './shopify.controller';

@Module({
  imports: [AuthModule, TenantModule, AdpModule],
  providers: [ShopifyService],
  controllers: [ShopifyController],
  exports: [ShopifyService],
})
export class ShopifyModule {}

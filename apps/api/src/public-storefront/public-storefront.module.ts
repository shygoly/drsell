import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AdpModule } from '../adp/adp.module';
import { PublicStorefrontService } from './public-storefront.service';
import { PublicStorefrontController } from './public-storefront.controller';

@Module({
  imports: [TenantModule, AdpModule],
  providers: [PublicStorefrontService],
  controllers: [PublicStorefrontController],
})
export class PublicStorefrontModule {}

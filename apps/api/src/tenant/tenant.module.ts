import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { ShopAccessTokenService } from './shop-access-token.service';

@Module({
  imports: [PrismaModule],
  providers: [TenantService, ShopAccessTokenService],
  controllers: [TenantController],
  exports: [TenantService, ShopAccessTokenService],
})
export class TenantModule {}

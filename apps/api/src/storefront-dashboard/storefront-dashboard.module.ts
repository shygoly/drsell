import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorefrontDashboardController } from './storefront-dashboard.controller';
import { StorefrontDashboardService } from './storefront-dashboard.service';

@Module({
  imports: [PrismaModule],
  controllers: [StorefrontDashboardController],
  providers: [StorefrontDashboardService],
})
export class StorefrontDashboardModule {}

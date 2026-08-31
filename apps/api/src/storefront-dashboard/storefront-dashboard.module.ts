import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipModule } from '../membership/membership.module';
import { StorefrontDashboardController } from './storefront-dashboard.controller';
import { StorefrontDashboardService } from './storefront-dashboard.service';

@Module({
  imports: [PrismaModule, MembershipModule],
  controllers: [StorefrontDashboardController],
  providers: [StorefrontDashboardService],
})
export class StorefrontDashboardModule {}

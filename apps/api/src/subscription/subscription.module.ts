import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { BillingService } from './billing.service';

@Module({
  imports: [PrismaModule, TenantModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class SubscriptionModule {}

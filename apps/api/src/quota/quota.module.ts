import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  // 闸门判定时要按陈旧度补同步订阅镜像（见 QuotaService.refreshIfStale）。
  // 无环：BillingService 只依赖 Prisma 与 TenantService。
  imports: [SubscriptionModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}

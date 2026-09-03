import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  async addFree(shopDomain: string, planCode = 'free') {
    const shop = await this.tenants.ensureShopTenant(shopDomain);
    return this.prisma.subscription.create({
      data: {
        shopId: shop.id,
        planCode,
        status: 'ACTIVE',
        trialEnds: new Date(Date.now() + 14 * 86400000),
      },
    });
  }

  async cancel(id: string) {
    return this.prisma.subscription.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async list(shopDomain: string) {
    const shop = await this.tenants.getByShopDomain(shopDomain);
    if (!shop) return [];
    return this.prisma.subscription.findMany({ where: { shopId: shop.id } });
  }
}

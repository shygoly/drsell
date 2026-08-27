import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureShopTenant(shopDomain: string, accessToken?: string, scopes?: string) {
    const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    let shop = await this.prisma.shop.findUnique({ where: { shopDomain: domain } });
    if (!shop) {
      const tenant = await this.prisma.tenant.create({
        data: { name: domain },
      });
      shop = await this.prisma.shop.create({
        data: {
          shopDomain: domain,
          tenantId: tenant.id,
          accessToken,
          scopes,
        },
      });
    } else if (accessToken) {
      shop = await this.prisma.shop.update({
        where: { id: shop.id },
        data: { accessToken, scopes, uninstalledAt: null },
      });
    }
    return shop;
  }

  async getByShopDomain(shopDomain: string) {
    const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return this.prisma.shop.findUnique({
      where: { shopDomain: domain },
      include: { tenant: true, botSetting: true },
    });
  }
}

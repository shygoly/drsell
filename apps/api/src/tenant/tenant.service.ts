import { Injectable } from '@nestjs/common';
import {
  decryptShopAccessToken,
  encryptShopAccessToken,
} from '../crypto/shop-token-cipher';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureShopTenant(shopDomain: string, accessToken?: string, scopes?: string) {
    const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    let shop = await this.prisma.shop.findUnique({ where: { shopDomain: domain } });
    const storedToken = accessToken ? encryptShopAccessToken(accessToken) : undefined;
    if (!shop) {
      const tenant = await this.prisma.tenant.create({
        data: { name: domain },
      });
      try {
        shop = await this.prisma.shop.create({
          data: {
            shopDomain: domain,
            tenantId: tenant.id,
            accessToken: storedToken,
            scopes,
          },
        });
      } catch (e) {
        // 并发首次登录可能同时创建，撞唯一约束时重取已存在的记录
        if ((e as { code?: string }).code === 'P2002') {
          shop = await this.prisma.shop.findUnique({
            where: { shopDomain: domain },
          });
        } else {
          throw e;
        }
      }
      if (!shop) {
        throw new Error(`Failed to resolve shop tenant for ${domain}`);
      }
    } else if (storedToken) {
      shop = await this.prisma.shop.update({
        where: { id: shop.id },
        data: { accessToken: storedToken, scopes, uninstalledAt: null },
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

  /** 解密 Shopify Admin API 用的 access token */
  getShopAccessToken(shop: { accessToken: string | null }): string | null {
    return decryptShopAccessToken(shop.accessToken);
  }
}

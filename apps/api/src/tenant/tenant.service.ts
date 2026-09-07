import { Injectable } from '@nestjs/common';
import {
  decryptShopAccessToken,
  encryptShopAccessToken,
} from '../crypto/shop-token-cipher';
import { PrismaService } from '../prisma/prisma.service';
import {
  PersistedTokenBundle,
  ShopAccessTokenService,
} from './shop-access-token.service';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopTokens: ShopAccessTokenService,
  ) {}

  /**
   * 确保店铺 + 租户存在。
   * 传入 tenantId（来自发起安装的账号已有租户）时复用，不再为每家店无脑建租户。
   * 若带上 token bundle（含 refresh / expiry），一并落库。
   */
  async ensureShopTenant(
    shopDomain: string,
    accessToken?: string,
    scopes?: string,
    tenantId?: string,
    tokenMeta?: Omit<PersistedTokenBundle, 'accessToken' | 'scopes'>,
  ) {
    const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    let shop = await this.prisma.shop.findUnique({ where: { shopDomain: domain } });
    const storedToken = accessToken ? encryptShopAccessToken(accessToken) : undefined;
    const storedRefresh =
      tokenMeta?.refreshToken !== undefined
        ? tokenMeta.refreshToken
          ? encryptShopAccessToken(tokenMeta.refreshToken)
          : null
        : undefined;

    if (!shop) {
      const tenant =
        (tenantId
          ? await this.prisma.tenant.findUnique({ where: { id: tenantId } })
          : null) ??
        (await this.prisma.tenant.create({
          data: { name: domain },
        }));
      try {
        shop = await this.prisma.shop.create({
          data: {
            shopDomain: domain,
            tenantId: tenant.id,
            accessToken: storedToken,
            refreshToken: storedRefresh,
            accessTokenExpiresAt: tokenMeta?.accessTokenExpiresAt ?? undefined,
            refreshTokenExpiresAt: tokenMeta?.refreshTokenExpiresAt ?? undefined,
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
      if (accessToken && shop.accessToken !== storedToken) {
        // Race: another request created the row without our token — persist ours.
        shop = await this.shopTokens.persistTokenBundle(shop.id, {
          accessToken,
          refreshToken: tokenMeta?.refreshToken,
          accessTokenExpiresAt: tokenMeta?.accessTokenExpiresAt,
          refreshTokenExpiresAt: tokenMeta?.refreshTokenExpiresAt,
          scopes,
        });
      }
    } else if (accessToken) {
      shop = await this.shopTokens.persistTokenBundle(shop.id, {
        accessToken,
        refreshToken: tokenMeta?.refreshToken,
        accessTokenExpiresAt: tokenMeta?.accessTokenExpiresAt,
        refreshTokenExpiresAt: tokenMeta?.refreshTokenExpiresAt,
        scopes,
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

  getById(id: string) {
    return this.prisma.shop.findUnique({
      where: { id },
      include: { tenant: true, botSetting: true },
    });
  }

  /** 解密 Shopify Admin API 用的 access token（不做 refresh；后台调用请用 getValidAccessToken） */
  getShopAccessToken(shop: { accessToken: string | null }): string | null {
    return decryptShopAccessToken(shop.accessToken);
  }

  /** 可用的 Admin API token：必要时 migrate / refresh */
  getValidAccessToken(
    shop: Parameters<ShopAccessTokenService['getValidAccessToken']>[0],
  ) {
    return this.shopTokens.getValidAccessToken(shop);
  }
}

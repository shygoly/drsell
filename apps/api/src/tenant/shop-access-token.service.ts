import { Injectable, Logger } from '@nestjs/common';
import '@shopify/shopify-api/adapters/node';
import { ApiVersion, shopifyApi } from '@shopify/shopify-api';
import type { Shop } from '@prisma/client';
import {
  decryptShopAccessToken,
  encryptShopAccessToken,
} from '../crypto/shop-token-cipher';
import { PrismaService } from '../prisma/prisma.service';

/** Refresh when fewer than this many ms remain before access-token expiry. */
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export type ShopTokenFields = Pick<
  Shop,
  | 'id'
  | 'shopDomain'
  | 'accessToken'
  | 'refreshToken'
  | 'accessTokenExpiresAt'
  | 'refreshTokenExpiresAt'
>;

export type PersistedTokenBundle = {
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scopes?: string | null;
};

@Injectable()
export class ShopAccessTokenService {
  private readonly logger = new Logger(ShopAccessTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  private shopifyAuth() {
    return shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY || '',
      apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
      scopes: [],
      hostName: (process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top').replace(
        /^https?:\/\//,
        '',
      ),
      apiVersion: ApiVersion.July26,
      isEmbeddedApp: true,
    }).auth;
  }

  decryptAccessToken(shop: Pick<ShopTokenFields, 'accessToken'>): string | null {
    return decryptShopAccessToken(shop.accessToken);
  }

  decryptRefreshToken(shop: Pick<ShopTokenFields, 'refreshToken'>): string | null {
    return decryptShopAccessToken(shop.refreshToken);
  }

  /**
   * Persist a newly issued offline token pair. Refresh token is encrypted with
   * the same key as accessToken. Callers must await this before discarding the
   * previous token (migrate is irreversible on Shopify's side).
   */
  async persistTokenBundle(
    shopId: string,
    bundle: PersistedTokenBundle,
  ): Promise<Shop> {
    const data: {
      accessToken?: string;
      refreshToken?: string | null;
      accessTokenExpiresAt?: Date | null;
      refreshTokenExpiresAt?: Date | null;
      scopes?: string;
      uninstalledAt?: null;
    } = {};
    if (bundle.accessToken) {
      data.accessToken = encryptShopAccessToken(bundle.accessToken);
    }
    if (bundle.refreshToken !== undefined) {
      data.refreshToken = bundle.refreshToken
        ? encryptShopAccessToken(bundle.refreshToken)
        : null;
    }
    if (bundle.accessTokenExpiresAt !== undefined) {
      data.accessTokenExpiresAt = bundle.accessTokenExpiresAt;
    }
    if (bundle.refreshTokenExpiresAt !== undefined) {
      data.refreshTokenExpiresAt = bundle.refreshTokenExpiresAt;
    }
    if (bundle.scopes != null) data.scopes = bundle.scopes;
    data.uninstalledAt = null;
    return this.prisma.shop.update({ where: { id: shopId }, data });
  }

  /** Clear all Shopify credentials on uninstall. */
  async clearTokens(shopId: string): Promise<void> {
    await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        uninstalledAt: new Date(),
      },
    });
  }

  needsRefresh(
    shop: Pick<ShopTokenFields, 'accessTokenExpiresAt'>,
    now = new Date(),
  ): boolean {
    if (!shop.accessTokenExpiresAt) return false;
    return (
      shop.accessTokenExpiresAt.getTime() - now.getTime() <=
      ACCESS_TOKEN_REFRESH_SKEW_MS
    );
  }

  isLegacyNonExpiring(
    shop: Pick<ShopTokenFields, 'accessToken' | 'accessTokenExpiresAt'>,
  ): boolean {
    return !!shop.accessToken && !shop.accessTokenExpiresAt;
  }

  /**
   * Return a usable Admin API access token: migrate legacy non-expiring tokens,
   * refresh when near expiry, otherwise decrypt the stored one.
   */
  async getValidAccessToken(shop: ShopTokenFields): Promise<string | null> {
    const plain = this.decryptAccessToken(shop);
    if (!plain) return null;

    let current: ShopTokenFields = shop;

    if (this.isLegacyNonExpiring(current)) {
      current = await this.migrateLegacyToken(current, plain);
    }

    if (this.needsRefresh(current)) {
      current = await this.refresh(current);
    }

    return this.decryptAccessToken(current);
  }

  private async migrateLegacyToken(
    shop: ShopTokenFields,
    nonExpiringToken: string,
  ): Promise<ShopTokenFields> {
    this.logger.log(`migrating non-expiring offline token for ${shop.shopDomain}`);
    const { session } = await this.shopifyAuth().migrateToExpiringToken({
      shop: shop.shopDomain,
      nonExpiringOfflineAccessToken: nonExpiringToken,
    });
    if (!session.accessToken) {
      throw new Error(`migrateToExpiringToken returned no accessToken for ${shop.shopDomain}`);
    }
    // Persist BEFORE returning — Shopify already destroyed the old token.
    return this.persistTokenBundle(shop.id, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      accessTokenExpiresAt: session.expires ?? null,
      refreshTokenExpiresAt: session.refreshTokenExpires ?? null,
      scopes: session.scope ?? null,
    });
  }

  private async refresh(shop: ShopTokenFields): Promise<ShopTokenFields> {
    const refreshToken = this.decryptRefreshToken(shop);
    if (!refreshToken) {
      throw new Error(
        `access token expired for ${shop.shopDomain} but no refreshToken is stored`,
      );
    }
    this.logger.log(`refreshing offline access token for ${shop.shopDomain}`);
    const { session } = await this.shopifyAuth().refreshToken({
      shop: shop.shopDomain,
      refreshToken,
    });
    if (!session.accessToken) {
      throw new Error(`refreshToken returned no accessToken for ${shop.shopDomain}`);
    }
    return this.persistTokenBundle(shop.id, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      accessTokenExpiresAt: session.expires ?? null,
      refreshTokenExpiresAt: session.refreshTokenExpires ?? null,
      scopes: session.scope ?? null,
    });
  }
}

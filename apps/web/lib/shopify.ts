import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, type Session } from '@shopify/shopify-api';

let _shopify: ReturnType<typeof shopifyApi> | null = null;

export function getShopify() {
  if (_shopify) return _shopify;
  const apiKey = process.env.SHOPIFY_API_KEY || 'build-placeholder';
  const apiSecret = process.env.SHOPIFY_API_SECRET || 'build-placeholder-secret';
  const hostName = (process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top').replace(
    /^https?:\/\//,
    '',
  );
  _shopify = shopifyApi({
    apiKey,
    apiSecretKey: apiSecret,
    scopes: (process.env.SCOPES ||
      'read_customers,read_orders,read_products,write_orders,write_products'
    ).split(','),
    hostName,
    apiVersion: ApiVersion.April25,
    isEmbeddedApp: true,
  });
  return _shopify;
}

export type { Session };

/** @deprecated use getShopify() */
export const shopify = new Proxy({} as ReturnType<typeof shopifyApi>, {
  get(_t, prop) {
    return (getShopify() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

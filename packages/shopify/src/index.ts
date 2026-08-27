import { createHmac, timingSafeEqual } from 'node:crypto';

export type ShopifyAppConfig = {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  appUrl: string;
  apiVersion?: string;
};

export function verifyShopifyWebhookHmac(
  rawBody: Buffer | string,
  hmacHeader: string | undefined,
  apiSecret: string,
): boolean {
  if (!hmacHeader) return false;
  const digest = createHmac('sha256', apiSecret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody)
    .digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildAdminGraphqlUrl(shop: string, apiVersion = '2025-04'): string {
  const host = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${host}/admin/api/${apiVersion}/graphql.json`;
}

export async function shopifyGraphql<T = unknown>(params: {
  shop: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
  apiVersion?: string;
}): Promise<T> {
  const url = buildAdminGraphqlUrl(params.shop, params.apiVersion);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': params.accessToken,
    },
    body: JSON.stringify({ query: params.query, variables: params.variables }),
  });
  if (!res.ok) {
    throw new Error(`Shopify GraphQL HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const DEFAULT_SCOPES = [
  'read_customers',
  'read_orders',
  'read_products',
  'write_orders',
  'write_products',
];

import { createHmac, timingSafeEqual } from 'node:crypto';

export type ShopifyAppConfig = {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  appUrl: string;
  apiVersion?: string;
};

function hmacMatches(rawBody: Buffer | string, hmacHeader: string, secret: string): boolean {
  if (!secret) return false;
  const digest = createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 校验 Shopify webhook 签名。
 *
 * 支持一个可选的**上一把密钥**：轮换 client secret 后，Shopify 在一段时间内
 * 仍可能用旧密钥签名，而我们已经换成新的——表现就是所有 webhook 401，
 * 且用新密钥自签测试全部通过（2026-09-09 生产上就是这个形态）。
 * 只在新密钥不匹配时才回退到旧密钥，并把「命中了哪一把」返回给调用方，
 * 好让日志说清楚轮换窗口是否还没过去。
 */
export type WebhookHmacResult = { ok: boolean; matched: 'current' | 'previous' | null };

export function verifyShopifyWebhookHmacDetailed(
  rawBody: Buffer | string,
  hmacHeader: string | undefined,
  apiSecret: string,
  previousApiSecret?: string,
): WebhookHmacResult {
  if (!hmacHeader) return { ok: false, matched: null };
  if (hmacMatches(rawBody, hmacHeader, apiSecret)) return { ok: true, matched: 'current' };
  if (previousApiSecret && hmacMatches(rawBody, hmacHeader, previousApiSecret)) {
    return { ok: true, matched: 'previous' };
  }
  return { ok: false, matched: null };
}

export function verifyShopifyWebhookHmac(
  rawBody: Buffer | string,
  hmacHeader: string | undefined,
  apiSecret: string,
  previousApiSecret?: string,
): boolean {
  return verifyShopifyWebhookHmacDetailed(rawBody, hmacHeader, apiSecret, previousApiSecret).ok;
}

export function buildAdminGraphqlUrl(shop: string, apiVersion = '2026-07'): string {
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

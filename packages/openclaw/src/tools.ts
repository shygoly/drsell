import {
  type AdpQuery,
  lookupOrder,
  lookupProducts,
  lookupShopSummary,
} from './adp-reader';
import { assertSafeToolAllowlist, toolNamesForSource } from './tool-allowlist';
import type { SupportSource } from './types';

export type AdpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, never>;
};

export type AdpToolDef = {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<AdpToolResult>;
};

function textResult(text: string): AdpToolResult {
  return { content: [{ type: 'text', text }], details: {} };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asLimit(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 20;
  return n;
}

export function createAdpTools(opts: {
  shopDomain: string;
  query: AdpQuery;
  source?: SupportSource | null;
}): { names: string[]; tools: AdpToolDef[] } {
  const shop = opts.shopDomain;
  const names = assertSafeToolAllowlist(toolNamesForSource(opts.source));
  const tools: AdpToolDef[] = [];

  tools.push({
    name: 'adp_shop_summary',
    label: 'Shop summary',
    description: 'Summarize catalog size and price range for this shop.',
    parameters: { type: 'object', properties: { shop: { type: 'string' } } },
    execute: async () => textResult(await lookupShopSummary(opts.query, shop)),
  });

  tools.push({
    name: 'adp_search_products',
    label: 'Search products',
    description: 'Search products in this shop by keyword.',
    parameters: {
      type: 'object',
      properties: {
        shop: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    execute: async (_id, params) =>
      textResult(
        await lookupProducts(opts.query, shop, asString(params.query), asLimit(params.limit)),
      ),
  });

  if (names.includes('adp_get_order')) {
    tools.push({
      name: 'adp_get_order',
      label: 'Get order',
      description: 'Look up one order in this shop by order id.',
      parameters: {
        type: 'object',
        properties: {
          shop: { type: 'string' },
          order_id: { type: 'string' },
        },
      },
      execute: async (_id, params) =>
        textResult(
          await lookupOrder(
            opts.query,
            shop,
            asString(params.order_id) ?? asString(params.orderId) ?? '',
          ),
        ),
    });
  }

  return { names, tools };
}

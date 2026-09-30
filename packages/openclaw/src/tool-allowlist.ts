import type { SupportSource } from './types';

export const FORBIDDEN_TOOLS = [
  'bash',
  'read',
  'write',
  'edit',
  'exec',
  'adp_get_after_sales',
] as const;

const SHOPIFY_TOOLS = [
  'adp_shop_summary',
  'adp_search_products',
  'adp_get_order',
] as const;

const MEDUSA_TOOLS = ['adp_shop_summary', 'adp_search_products'] as const;

export function toolNamesForSource(source?: SupportSource | null): string[] {
  return source === 'medusa' ? [...MEDUSA_TOOLS] : [...SHOPIFY_TOOLS];
}

export function assertSafeToolAllowlist(tools: string[]): string[] {
  const forbidden = tools.filter((name) =>
    (FORBIDDEN_TOOLS as readonly string[]).includes(name),
  );
  if (forbidden.length > 0) {
    throw new Error(`forbidden tool in Pi allowlist: ${forbidden.join(',')}`);
  }
  const allowed = new Set<string>([...SHOPIFY_TOOLS]);
  const unknown = tools.filter((name) => !allowed.has(name));
  if (unknown.length > 0) {
    throw new Error(`unknown tool in Pi allowlist: ${unknown.join(',')}`);
  }
  return tools;
}

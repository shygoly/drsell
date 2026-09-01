/** 顶栏搜索路由：邮箱 → 账号；其余 → 店铺（含 .myshopify.com 补全） */
export function normalizeShopQuery(raw: string): string {
  const q = raw.trim().toLowerCase();
  if (!q) return '';
  if (q.includes('.myshopify.com')) return q;
  if (q.includes('.')) return q;
  return `${q}.myshopify.com`;
}

export function resolveSearchRoute(query: string): `/shops?q=${string}` | `/accounts?q=${string}` {
  const q = query.trim();
  if (!q) return '/shops?q=';
  if (q.includes('@')) {
    return `/accounts?q=${encodeURIComponent(q)}`;
  }
  return `/shops?q=${encodeURIComponent(normalizeShopQuery(q))}`;
}

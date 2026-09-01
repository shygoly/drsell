export type AuditLogFilters = {
  q?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  shopDomains?: string[];
};

export function buildAuditWhere(filters: AuditLogFilters) {
  const AND: Record<string, unknown>[] = [];

  const term = filters.q?.trim();
  if (term) {
    AND.push({
      OR: [
        { shopDomain: { contains: term, mode: 'insensitive' as const } },
        { actorEmail: { contains: term, mode: 'insensitive' as const } },
      ],
    });
  }

  if (filters.action?.trim()) {
    AND.push({ action: filters.action.trim() });
  }

  if (filters.actor?.trim()) {
    AND.push({
      actorEmail: { contains: filters.actor.trim(), mode: 'insensitive' as const },
    });
  }

  if (filters.from) {
    const d = new Date(filters.from);
    if (!Number.isNaN(d.getTime())) AND.push({ createdAt: { gte: d } });
  }

  if (filters.to) {
    const d = new Date(filters.to);
    if (!Number.isNaN(d.getTime())) AND.push({ createdAt: { lte: d } });
  }

  if (filters.shopDomains?.length) {
    AND.push({ shopDomain: { in: filters.shopDomains } });
  }

  return AND.length ? { AND } : {};
}

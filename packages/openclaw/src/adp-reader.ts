export type AdpQuery = (sql: string, params: unknown[]) => Promise<unknown[]>;

type PoolLike = {
  query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
};

export function buildAdpReaderUrl(env: NodeJS.Dict<string>): string {
  const explicit = env.ADP_READER_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const password = env.ADP_READER_PASSWORD;
  if (!password) {
    throw new Error('ADP_READER_PASSWORD or ADP_READER_DATABASE_URL is required');
  }
  const host = env.ADP_READER_HOST?.trim() || '127.0.0.1';
  const port = env.ADP_READER_PORT?.trim() || '5433';
  const db = env.ADP_READER_DATABASE?.trim() || 'drsell';
  return `postgresql://adp_reader:${encodeURIComponent(password)}@${host}:${port}/${db}?sslmode=disable`;
}

export function createAdpQuery(pool: PoolLike): AdpQuery {
  return async (sql, params) => {
    const result = await pool.query(sql, params);
    return result.rows;
  };
}

async function runLookup(query: AdpQuery, sql: string, params: unknown[]): Promise<string> {
  try {
    const rows = await query(sql, params);
    return JSON.stringify(rows);
  } catch {
    return 'lookup failed';
  }
}

export function lookupShopSummary(query: AdpQuery, shop: string): Promise<string> {
  return runLookup(query, 'SELECT * FROM adp_shop_summary($1)', [shop]);
}

export function lookupProducts(
  query: AdpQuery,
  shop: string,
  q: string | null,
  limit: number,
): Promise<string> {
  return runLookup(query, 'SELECT * FROM adp_search_products($1, $2, $3)', [
    shop,
    q,
    limit,
  ]);
}

export function lookupOrder(query: AdpQuery, shop: string, orderId: string): Promise<string> {
  return runLookup(query, 'SELECT * FROM adp_get_order($1, $2)', [shop, orderId]);
}

export function createAdpReaderPool(env: NodeJS.Dict<string> = process.env): import('pg').Pool {
  const { Pool } = require('pg') as typeof import('pg');
  return new Pool({
    connectionString: buildAdpReaderUrl(env),
    max: 4,
    statement_timeout: 5000,
  });
}

import {
  buildAdpReaderUrl,
  createAdpQuery,
  lookupOrder,
  lookupProducts,
  lookupShopSummary,
} from './adp-reader';

describe('buildAdpReaderUrl', () => {
  it('ADP_READER_DATABASE_URL 优先', () => {
    expect(
      buildAdpReaderUrl({
        ADP_READER_DATABASE_URL: 'postgresql://adp_reader:x@127.0.0.1:5433/drsell?sslmode=disable',
        ADP_READER_PASSWORD: 'ignored',
      }),
    ).toBe('postgresql://adp_reader:x@127.0.0.1:5433/drsell?sslmode=disable');
  });

  it('用密码、host、port 拼 DSN，密码做 URL 编码', () => {
    expect(
      buildAdpReaderUrl({
        ADP_READER_PASSWORD: 'p@ss/w',
        ADP_READER_HOST: '127.0.0.1',
        ADP_READER_PORT: '5433',
      }),
    ).toBe(
      'postgresql://adp_reader:p%40ss%2Fw@127.0.0.1:5433/drsell?sslmode=disable',
    );
  });

  it('缺密码则抛错', () => {
    expect(() => buildAdpReaderUrl({})).toThrow(/ADP_READER/);
  });
});

describe('lookups', () => {
  it('shop_summary 把闭包 shop 作为 $1', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = createAdpQuery({
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ product_count: 2 }] };
      },
    });
    const text = await lookupShopSummary(query, 'real.myshopify.com');
    expect(calls[0].sql).toMatch(/adp_shop_summary\(\$1\)/);
    expect(calls[0].params).toEqual(['real.myshopify.com']);
    expect(text).toContain('product_count');
  });

  it('search 使用 $1 shop、$2 query、$3 limit', async () => {
    const calls: Array<{ params: unknown[] }> = [];
    const query = createAdpQuery({
      query: async (_sql: string, params: unknown[]) => {
        calls.push({ params });
        return { rows: [] };
      },
    });
    await lookupProducts(query, 'real.myshopify.com', 'shoe', 7);
    expect(calls[0].params).toEqual(['real.myshopify.com', 'shoe', 7]);
  });

  it('失败返回 lookup failed，不含 sql', async () => {
    const query = createAdpQuery({
      query: async () => {
        throw new Error('password=secret SELECT * FROM adp_shop_summary');
      },
    });
    const text = await lookupShopSummary(query, 'x.com');
    expect(text).toBe('lookup failed');
    expect(text).not.toMatch(/secret|SELECT/i);
  });

  it('get_order 使用 $1 shop、$2 order id', async () => {
    const calls: Array<{ params: unknown[] }> = [];
    const query = createAdpQuery({
      query: async (_sql: string, params: unknown[]) => {
        calls.push({ params });
        return { rows: [{ status: 'paid' }] };
      },
    });
    await lookupOrder(query, 'real.myshopify.com', '1001');
    expect(calls[0].params).toEqual(['real.myshopify.com', '1001']);
  });
});

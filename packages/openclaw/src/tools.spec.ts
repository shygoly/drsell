import { createAdpTools } from './tools';
import type { AdpQuery } from './adp-reader';

function mockQuery(capture: { sql?: string; params?: unknown[] }): AdpQuery {
  return async (sql, params) => {
    capture.sql = sql;
    capture.params = params;
    return [{ ok: true }];
  };
}

describe('createAdpTools', () => {
  const shop = 'locked.myshopify.com';

  it('execute 忽略 params.shop，只查闭包域名', async () => {
    const capture: { params?: unknown[] } = {};
    const { tools } = createAdpTools({
      shopDomain: shop,
      source: 'shopify',
      query: mockQuery(capture),
    });
    const search = tools.find((t) => t.name === 'adp_search_products');
    expect(search).toBeDefined();
    const result = await search!.execute('call-1', {
      shop: 'evil.myshopify.com',
      query: 'shoe',
      limit: 3,
    });
    expect(capture.params?.[0]).toBe(shop);
    expect(capture.params?.[0]).not.toBe('evil.myshopify.com');
    expect(result.content[0].text).toContain('ok');
  });

  it('medusa 不包含 adp_get_order', () => {
    const { names, tools } = createAdpTools({
      shopDomain: shop,
      source: 'medusa',
      query: mockQuery({}),
    });
    expect(names).not.toContain('adp_get_order');
    expect(tools.map((t) => t.name)).not.toContain('adp_get_order');
  });

  it('shopify 包含 adp_get_order，且 order id 来自 params、shop 仍锁定', async () => {
    const capture: { params?: unknown[] } = {};
    const { tools } = createAdpTools({
      shopDomain: shop,
      source: 'shopify',
      query: mockQuery(capture),
    });
    const getOrder = tools.find((t) => t.name === 'adp_get_order');
    await getOrder!.execute('c', { shop: 'other.com', order_id: '1001' });
    expect(capture.params).toEqual([shop, '1001']);
  });
});

import {
  FORBIDDEN_TOOLS,
  assertSafeToolAllowlist,
  toolNamesForSource,
} from './tool-allowlist';

describe('toolNamesForSource', () => {
  it('shopify / 省略 / null 含三个 adp_*，不含 after_sales', () => {
    for (const source of ['shopify', undefined, null] as const) {
      const names = toolNamesForSource(source);
      expect(names).toEqual([
        'adp_shop_summary',
        'adp_search_products',
        'adp_get_order',
      ]);
      expect(names).not.toContain('adp_get_after_sales');
    }
  });

  it('medusa 只有商品两个工具', () => {
    expect(toolNamesForSource('medusa')).toEqual([
      'adp_shop_summary',
      'adp_search_products',
    ]);
  });
});

describe('assertSafeToolAllowlist', () => {
  it('合法白名单原样返回', () => {
    const tools = toolNamesForSource('shopify');
    expect(assertSafeToolAllowlist(tools)).toEqual(tools);
  });

  it.each(['bash', 'read', 'write', 'edit', 'exec', 'adp_get_after_sales'])(
    '拒绝 %s',
    (name) => {
      expect(() =>
        assertSafeToolAllowlist(['adp_shop_summary', name]),
      ).toThrow(/forbidden tool/i);
    },
  );

  it('FORBIDDEN_TOOLS 覆盖编码工具', () => {
    for (const name of ['bash', 'read', 'write', 'edit', 'exec']) {
      expect(FORBIDDEN_TOOLS).toContain(name);
    }
  });
});

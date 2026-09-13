import { IngestService } from './ingest.service';

const SHOP = { id: 'shop_1', tenantId: 'tenant_1', shopDomain: 'mystore.example.com' };

// 服务从配置解析店铺域（不信前端），测试提供该 env；具体值不重要（ensureShopTenant 被 mock）。
process.env.INGEST_STORE_DOMAIN = 'mystore.example.com';

function makeDeps(existing: Record<string, { sourceUpdatedAt: Date | null }> = {}) {
  const upserts: Array<{ model: string; where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const updates: Array<{ model: string; where: unknown; data: Record<string, unknown> }> = [];

  const model = (name: string) => ({
    findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const key = JSON.stringify(where);
      return Promise.resolve(existing[key] ? { ...existing[key] } : null);
    }),
    upsert: jest.fn((args: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      upserts.push({ model: name, ...args });
      return Promise.resolve({ id: `${name}_x`, ...args.create });
    }),
    update: jest.fn((args: { where: unknown; data: Record<string, unknown> }) => {
      updates.push({ model: name, ...args });
      return Promise.resolve({ id: `${name}_x` });
    }),
  });

  const prisma = {
    product: model('product'),
    order: model('order'),
    customer: model('customer'),
    afterSales: model('afterSales'),
  };
  const tenants = { ensureShopTenant: jest.fn().mockResolvedValue(SHOP) };
  const svc = new IngestService(prisma as never, tenants as never);
  return { svc, prisma, tenants, upserts, updates };
}

describe('IngestService', () => {
  it('产品：source=medusa、externalId 入 shopifyProductId、始终带 shopId', async () => {
    const { svc, upserts } = makeDeps();
    await svc.upsertProduct({ externalId: 'prod_01', name: 'Tee', price: 9.9, sourceUpdatedAt: new Date('2026-09-12T00:00:00Z') });

    expect(upserts).toHaveLength(1);
    const u = upserts[0];
    expect(u.model).toBe('product');
    expect(u.where).toEqual({ tenantId_shopifyProductId: { tenantId: 'tenant_1', shopifyProductId: 'prod_01' } });
    expect(u.create).toMatchObject({ tenantId: 'tenant_1', shopId: 'shop_1', shopifyProductId: 'prod_01', source: 'medusa', name: 'Tee' });
    expect(u.update).toMatchObject({ shopId: 'shop_1', source: 'medusa', name: 'Tee' });
  });

  it('产品：来源版本更旧则跳过（不 upsert）', async () => {
    const key = JSON.stringify({ tenantId_shopifyProductId: { tenantId: 'tenant_1', shopifyProductId: 'prod_01' } });
    const { svc, upserts } = makeDeps({ [key]: { sourceUpdatedAt: new Date('2026-09-12T10:00:00Z') } });
    const res = await svc.upsertProduct({ externalId: 'prod_01', name: 'stale', sourceUpdatedAt: new Date('2026-09-12T09:00:00Z') });

    expect(res).toEqual({ skipped: 'stale' });
    expect(upserts).toHaveLength(0);
  });

  it('订单：display_id 入 shopifyOrderId、Medusa 顾客 id 入 customerId、带 itemsJson', async () => {
    const { svc, upserts } = makeDeps();
    await svc.upsertOrder({
      externalId: '#1234',
      customerExternalId: 'cus_09',
      total: 42,
      status: 'completed',
      itemsJson: '[{"title":"Tee","qty":1}]',
    });

    const u = upserts[0];
    expect(u.where).toEqual({ tenantId_shopifyOrderId: { tenantId: 'tenant_1', shopifyOrderId: '#1234' } });
    expect(u.create).toMatchObject({ shopId: 'shop_1', source: 'medusa', shopifyOrderId: '#1234', customerId: 'cus_09', itemsJson: '[{"title":"Tee","qty":1}]' });
  });

  it('售后：按 [tenantId, source, externalId] upsert、带 shopId 与 orderExternalId', async () => {
    const { svc, upserts } = makeDeps();
    await svc.upsertAfterSales({ externalId: 'ret_01', orderExternalId: '#1234', type: 'return', status: 'requested', amount: 42, currency: 'usd' });

    const u = upserts[0];
    expect(u.model).toBe('afterSales');
    expect(u.where).toEqual({ tenantId_source_externalId: { tenantId: 'tenant_1', source: 'medusa', externalId: 'ret_01' } });
    expect(u.create).toMatchObject({ shopId: 'shop_1', source: 'medusa', type: 'return', orderExternalId: '#1234', amount: 42, currency: 'usd' });
  });

  it('库存：按 externalId 更新对应产品 stock', async () => {
    const { svc, updates } = makeDeps();
    await svc.updateInventory({ productExternalId: 'prod_01', stock: 7 });

    expect(updates).toHaveLength(1);
    expect(updates[0].model).toBe('product');
    expect(updates[0].where).toEqual({ tenantId_shopifyProductId: { tenantId: 'tenant_1', shopifyProductId: 'prod_01' } });
    expect(updates[0].data).toMatchObject({ stock: 7 });
  });
});

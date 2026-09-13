import { mapProduct, mapOrder, mapCustomer, mapAfterSales, mapInventory } from './index';

describe('connector mappers', () => {
  it('mapProduct: id→externalId、title→name、变体价、库存汇总、images→imagesJson', () => {
    const out = mapProduct({
      id: 'prod_01',
      title: 'Tee',
      updated_at: '2026-09-12T00:00:00Z',
      description: 'soft',
      status: 'published',
      handle: 'tee',
      variants: [
        { id: 'v1', prices: [{ amount: 19.99 }], inventory_quantity: 3 },
        { id: 'v2', prices: [{ amount: 21.99 }], inventory_quantity: 4 },
      ],
      images: [{ url: 'https://x/1.jpg' }, { url: 'https://x/2.jpg' }],
    });
    expect(out.externalId).toBe('prod_01');
    expect(out.name).toBe('Tee');
    expect(out.price).toBe(19.99);
    expect(out.stock).toBe(7);
    expect(out.status).toBe('published');
    expect(out.sourceUpdatedAt).toBe('2026-09-12T00:00:00Z');
    expect(JSON.parse(out.imagesJson!)).toEqual(['https://x/1.jpg', 'https://x/2.jpg']);
  });

  it('mapOrder: display_id→字符串 externalId、customer_id→customerExternalId、items→itemsJson', () => {
    const out = mapOrder({
      display_id: 1234,
      updated_at: '2026-09-12T01:00:00Z',
      customer_id: 'cus_09',
      status: 'completed',
      payment_status: 'captured',
      fulfillment_status: 'fulfilled',
      total: 41.98,
      items: [{ title: 'Tee', quantity: 2, unit_price: 19.99 }],
    });
    expect(out.externalId).toBe('1234');
    expect(out.customerExternalId).toBe('cus_09');
    expect(out.financialStatus).toBe('captured');
    expect(out.total).toBe(41.98);
    expect(JSON.parse(out.itemsJson!)).toEqual([{ title: 'Tee', qty: 2, unitPrice: 19.99 }]);
  });

  it('mapCustomer: 姓名拼接，缺名时回落 email', () => {
    expect(mapCustomer({ id: 'c1', first_name: 'Ada', last_name: 'Lovelace', email: 'a@x.com' }).displayName).toBe('Ada Lovelace');
    expect(mapCustomer({ id: 'c2', email: 'b@x.com' }).displayName).toBe('b@x.com');
    expect(mapCustomer({ id: 'c1' }).externalId).toBe('c1');
  });

  it('mapAfterSales: id→externalId、order_display_id→字符串、refund_amount→amount', () => {
    const out = mapAfterSales({
      id: 'ret_01',
      order_display_id: 1234,
      type: 'return',
      status: 'requested',
      reason: 'too small',
      refund_amount: 19.99,
      currency_code: 'usd',
    });
    expect(out.externalId).toBe('ret_01');
    expect(out.orderExternalId).toBe('1234');
    expect(out.type).toBe('return');
    expect(out.amount).toBe(19.99);
    expect(out.currency).toBe('usd');
  });

  it('mapInventory: 直通', () => {
    expect(mapInventory('prod_01', 5, '2026-09-12T02:00:00Z')).toEqual({
      productExternalId: 'prod_01',
      stock: 5,
      sourceUpdatedAt: '2026-09-12T02:00:00Z',
    });
  });
});

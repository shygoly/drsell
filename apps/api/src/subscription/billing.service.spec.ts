import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';

jest.mock('@drsell/shopify', () => ({
  shopifyGraphql: jest.fn(),
}));

import { shopifyGraphql } from '@drsell/shopify';
const mockedGraphql = shopifyGraphql as jest.Mock;

function mockDeps(overrides: Record<string, unknown> = {}) {
  const shop = {
    id: 's1',
    shopDomain: 'a.myshopify.com',
    tenantId: 't1',
    accessToken: 'tok',
  };
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const updateMany = jest.fn();
  const knowledgeJobCreate = jest.fn();

  const prisma = {
    shop: { findMany },
    subscription: { findFirst, create, update, updateMany },
    knowledgeSyncJob: { create: knowledgeJobCreate },
  } as never;
  const tenants = {
    getByShopDomain: jest.fn(async () => shop),
    getShopAccessToken: jest.fn(() => 'tok'),
    ...(overrides.tenants ?? {}),
  } as never;
  return {
    svc: new BillingService(prisma, tenants),
    findMany,
    findFirst,
    create,
    update,
    updateMany,
    shop,
  };
}

describe('BillingService', () => {
  beforeEach(() => {
    mockedGraphql.mockReset();
    mockedGraphql.mockResolvedValue({
      data: {
        appSubscriptionCreate: {
          userErrors: [],
          appSubscription: { id: 'gid://shopify/AppSubscription/1' },
          confirmationUrl: 'https://confirm',
        },
      },
    });
  });

  it('缺少 access token 时拒绝建 charge', async () => {
    const deps = mockDeps({
      tenants: {
        getByShopDomain: jest.fn(async () => null),
        getShopAccessToken: jest.fn(() => null),
      },
    });
    deps.findMany.mockResolvedValue([]);
    deps.findFirst.mockResolvedValue(null);
    await expect(deps.svc.setBillingShop('a.myshopify.com')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('指定 billing shop：取消旧 charge、建新全额 charge、翻转标记', async () => {
    const { svc, findMany, updateMany, create } = mockDeps();
    findMany.mockResolvedValue([
      {
        id: 's1',
        shopDomain: 'a.myshopify.com',
        tenantId: 't1',
        subscriptions: [
          { id: 'sub1', isBillingShop: true, shopifyChargeId: 'gid://old' },
        ],
      },
    ]);

    await svc.setBillingShop('a.myshopify.com');

    const calls = mockedGraphql.mock.calls.map((c) => c[0].query);
    expect(calls.some((q) => q.includes('appSubscriptionCancel'))).toBe(true);
    expect(calls.some((q) => q.includes('appSubscriptionCreate'))).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 's1' },
        data: { isBillingShop: false },
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isBillingShop: true }),
      }),
    );
  });

  it('reassign 把计费转移到组内下一家店', async () => {
    const { svc, findMany } = mockDeps();
    findMany.mockResolvedValue([
      { id: 's1', shopDomain: 'a.myshopify.com', subscriptions: [] },
      { id: 's2', shopDomain: 'b.myshopify.com', subscriptions: [] },
    ]);
    await svc.reassign('t1', 's1');
    const creates = mockedGraphql.mock.calls.filter((c) =>
      c[0].query.includes('appSubscriptionCreate'),
    );
    expect(creates).toHaveLength(1);
    expect(creates[0][0].shop).toBe('b.myshopify.com');
  });
});

import { BadRequestException } from '@nestjs/common';
import { BillingService, planCodeFromShopifyName } from './billing.service';

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
  const create = jest.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'sub_new',
    ...args.data,
  }));
  const update = jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
    id: args.where.id,
    ...args.data,
  }));
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
    getValidAccessToken: jest.fn(async () => 'tok'),
    ...(overrides.tenants ?? {}),
  } as never;
  return {
    svc: new BillingService(prisma, tenants),
    findMany,
    findFirst,
    create,
    update,
    updateMany,
    knowledgeJobCreate,
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
        getValidAccessToken: jest.fn(async () => null),
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

  describe('syncFromShopify — 托管计费的唯一知情渠道', () => {
    /**
     * 这组用例守的是「收了钱不给货」：商家在 Shopify 界面选了 Pro，
     * 我们没同步就会按 basic 的 1500 次掐掉他。
     */
    function mockActive(sub: Record<string, unknown> | null) {
      mockedGraphql.mockReset();
      mockedGraphql.mockResolvedValue({
        data: { currentAppInstallation: { activeSubscriptions: sub ? [sub] : [] } },
      });
    }

    it('Pro 订阅写回 planCode=pro 与 Shopify 给的周期结束时间', async () => {
      const { svc, findFirst, create } = mockDeps();
      mockActive({
        id: 'gid://shopify/AppSubscription/9',
        name: 'Pro',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-10-05T00:00:00Z',
      });
      findFirst.mockResolvedValue(null);

      await svc.syncFromShopify('a.myshopify.com');

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planCode: 'pro',
            status: 'ACTIVE',
            shopifyChargeId: 'gid://shopify/AppSubscription/9',
            currentPeriodEnd: new Date('2026-10-05T00:00:00Z'),
          }),
        }),
      );
    });

    it('套餐名对不上时不动 planCode —— 绝不把付费商家悄悄降级', async () => {
      const { svc, findFirst, update } = mockDeps();
      mockActive({ id: 'gid://x', name: 'Enterprise Custom', status: 'ACTIVE' });
      findFirst.mockResolvedValue({ id: 'sub1', planCode: 'pro', status: 'ACTIVE' });

      await svc.syncFromShopify('a.myshopify.com');

      const data = update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('planCode');
      expect(data.status).toBe('ACTIVE');
    });

    it('Shopify 说没有活跃订阅就置 CANCELLED，不留假的 ACTIVE', async () => {
      const { svc, findFirst, update } = mockDeps();
      mockActive(null);
      findFirst.mockResolvedValue({ id: 'sub1', planCode: 'pro', status: 'ACTIVE' });

      const out = await svc.syncFromShopify('a.myshopify.com');

      expect(out).toBeNull();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub1' },
          data: { status: 'CANCELLED', isBillingShop: false },
        }),
      );
    });

    it('已经是 CANCELLED 就不重复写', async () => {
      const { svc, findFirst, update } = mockDeps();
      mockActive(null);
      findFirst.mockResolvedValue({ id: 'sub1', planCode: 'basic', status: 'CANCELLED' });
      await svc.syncFromShopify('a.myshopify.com');
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('planCodeFromShopifyName', () => {
    it('按 PLANS 的名字与 code 双向匹配（大小写无关）', () => {
      expect(planCodeFromShopifyName('Basic')).toBe('basic');
      expect(planCodeFromShopifyName('  PRO ')).toBe('pro');
      expect(planCodeFromShopifyName('pro')).toBe('pro');
    });

    it('未知名字返回 null，而不是回落到 basic', () => {
      expect(planCodeFromShopifyName('Plus')).toBeNull();
      expect(planCodeFromShopifyName('')).toBeNull();
      expect(planCodeFromShopifyName(null)).toBeNull();
    });
  });
});

describe('留痕的 shopDomain 列', () => {
  it('sync 必须写店铺域名而不是 tenantId —— 否则运营台按店查不到', async () => {
    // 2026-09-09：这里曾写 tenantId，于是运营台按域名查 billing:sync 永远查不到，
    // 把刚同步过两次的店报成「镜像从未与 Shopify 同步过」。而那条警告恰恰用来
    // 支撑「要不要开闸停服」这个不可逆决策。
    const { svc, findFirst, knowledgeJobCreate } = mockDeps();
    findFirst.mockResolvedValue(null);
    mockedGraphql.mockReset();
    mockedGraphql.mockResolvedValue({
      data: {
        currentAppInstallation: {
          activeSubscriptions: [
            { id: 'gid://1', name: 'Basic', status: 'ACTIVE', test: false, currentPeriodEnd: null },
          ],
        },
      },
    });

    await svc.syncFromShopify('a.myshopify.com');

    const logged = knowledgeJobCreate.mock.calls
      .map((c: [{ data: Record<string, unknown> }]) => c[0].data)
      .find((d: Record<string, unknown>) => d.kind === 'billing:sync');
    expect(logged).toBeDefined();
    expect(logged?.shopDomain).toBe('a.myshopify.com');
    expect(logged?.shopDomain).not.toBe('t1');
  });
});

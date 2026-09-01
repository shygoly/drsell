import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OpsService } from './ops.service';
import { SubscriptionMirrorService } from './subscription-mirror.service';

describe('OpsService', () => {
  const prisma = {
    adminUser: { findMany: jest.fn(), findUnique: jest.fn() },
    shop: { findUnique: jest.fn(), findMany: jest.fn() },
    chatStatDaily: { aggregate: jest.fn() },
    knowledgeSyncJob: { create: jest.fn(), update: jest.fn() },
    botSetting: { update: jest.fn() },
    auditLog: { findMany: jest.fn(), count: jest.fn() },
    membership: { count: jest.fn() },
  };
  const mirror = {
    extendUnfreeze: jest.fn(),
  } as unknown as SubscriptionMirrorService;
  const billing = { setBillingShop: jest.fn() };
  const shopify = { startBatchSync: jest.fn().mockResolvedValue({ started: ['products'] }) };
  const jwt = { sign: jest.fn(() => 'tok') } as unknown as JwtService;
  const svc = new OpsService(prisma as never, mirror, billing as never, shopify as never, jwt);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('按邮箱前缀检索账号', async () => {
    prisma.adminUser.findMany.mockResolvedValue([{ id: '1', email: 'ops@test.com', role: 'superadmin' }]);
    const rows = await svc.searchAccounts('ops');
    expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { startsWith: 'ops' } } }),
    );
    expect(rows).toHaveLength(1);
  });

  it('按店铺域名反查所属账号', async () => {
    prisma.shop.findUnique.mockResolvedValue({
      shopDomain: 'a.myshopify.com',
      memberships: [{ user: { id: 'u1', email: 'a@test.com', role: 'owner' }, role: 'owner' }],
    });
    const result = await svc.findAccountByShopDomain('a.myshopify.com');
    expect(result.accounts[0].email).toBe('a@test.com');
  });

  it('账号详情返回名下店铺、角色、哪家是计费店', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@test.com',
      role: 'admin',
      tenantId: null,
      createdAt: new Date('2026-02-02'),
      updatedAt: new Date('2026-09-01'),
      memberships: [{
        role: 'owner',
        shop: {
          shopDomain: 'a.myshopify.com',
          installedAt: new Date('2026-03-12'),
          subscriptions: [{ isBillingShop: true }],
        },
      }],
    });
    prisma.auditLog.findMany.mockResolvedValue([]);
    const detail = await svc.getAccount('u1');
    expect(detail.shops[0]).toEqual(
      expect.objectContaining({ shopDomain: 'a.myshopify.com', isBillingShop: true, installedAt: expect.any(String) }),
    );
    expect(detail.createdAt).toBeDefined();
    expect(detail.auditPreview).toEqual([]);
  });

  it('队列按剩余天数升序，不分状态混排', async () => {
    const now = new Date('2026-09-01T00:00:00Z');
    prisma.shop.findMany.mockResolvedValue([
      {
        shopDomain: 'b.myshopify.com',
        memberships: [],
        subscriptions: [{
          status: 'ACTIVE',
          trialEnds: null,
          currentPeriodEnd: new Date('2026-09-05'),
          unfreezeBy: null,
          frozenAt: null,
        }],
      },
      {
        shopDomain: 'a.myshopify.com',
        memberships: [],
        subscriptions: [{
          status: 'ACTIVE',
          trialEnds: new Date('2026-09-02'),
          currentPeriodEnd: null,
          unfreezeBy: null,
          frozenAt: null,
        }],
      },
    ]);
    const queue = await svc.expiryQueue(now);
    expect(queue.map((q) => q.shopDomain)).toEqual(['a.myshopify.com', 'b.myshopify.com']);
  });

  it('试用最后 3 天、解冻期内、计费周期 7 天内 —— 三类都进队列', async () => {
    const now = new Date('2026-09-01T00:00:00Z');
    prisma.shop.findMany.mockResolvedValue([
      {
        shopDomain: 'trial.myshopify.com',
        memberships: [],
        subscriptions: [{ status: 'ACTIVE', trialEnds: new Date('2026-09-03'), currentPeriodEnd: null, unfreezeBy: null, frozenAt: null }],
      },
      {
        shopDomain: 'frozen.myshopify.com',
        memberships: [],
        subscriptions: [{ status: 'FROZEN', trialEnds: null, currentPeriodEnd: null, unfreezeBy: new Date('2026-09-10'), frozenAt: new Date('2026-08-20') }],
      },
      {
        shopDomain: 'period.myshopify.com',
        memberships: [],
        subscriptions: [{ status: 'ACTIVE', trialEnds: null, currentPeriodEnd: new Date('2026-09-06'), unfreezeBy: null, frozenAt: null }],
      },
    ]);
    const queue = await svc.expiryQueue(now);
    expect(queue.map((q) => q.queueKind).sort()).toEqual(['period', 'trial', 'unfreeze']);
  });

  it('终态店铺不进队列', async () => {
    prisma.shop.findMany.mockResolvedValue([
      {
        shopDomain: 'dead.myshopify.com',
        subscriptions: [{ status: 'CANCELLED', trialEnds: new Date('2026-09-02'), currentPeriodEnd: null, unfreezeBy: null, frozenAt: null }],
      },
    ]);
    const queue = await svc.expiryQueue(new Date('2026-09-01'));
    expect(queue).toHaveLength(0);
  });

  it('extendFreeze 委托 mirror', async () => {
    prisma.shop.findUnique.mockResolvedValue({
      shopDomain: 'a.myshopify.com',
      subscriptions: [{ id: 'sub1' }],
    });
    mirror.extendUnfreeze = jest.fn().mockResolvedValue({ unfreezeBy: new Date() });
    await svc.extendFreeze('a.myshopify.com', 5);
    expect(mirror.extendUnfreeze).toHaveBeenCalledWith('sub1', 5);
  });

  it('getShop 找不到店时抛 NotFoundException', async () => {
    prisma.shop.findUnique.mockResolvedValue(null);
    await expect(svc.getShop('missing.myshopify.com')).rejects.toThrow(NotFoundException);
  });

  it('getShop 聚合计费周期内 AI 解决次数', async () => {
    prisma.shop.findUnique.mockResolvedValue({
      id: 'shop1',
      shopDomain: 'a.myshopify.com',
      installedAt: new Date('2026-01-01'),
      subscriptions: [{
        status: 'ACTIVE',
        planCode: 'pro',
        isBillingShop: true,
        trialEnds: null,
        currentPeriodEnd: new Date('2026-09-30'),
        unfreezeBy: null,
        frozenAt: null,
        updatedAt: new Date(),
        shopifyChargeId: 'gid://shopify/AppSubscription/1',
        seats: 2,
      }],
      botSetting: { widgetVisible: true },
      memberships: [],
    });
    prisma.chatStatDaily.aggregate.mockResolvedValue({
      _sum: { count: 100, aiResolvedCount: 42 },
    });
    prisma.membership.count.mockResolvedValue(2);
    const detail = await svc.getShop('a.myshopify.com');
    expect(detail.aiResolved).toBe(42);
    expect(detail.chatCount).toBe(100);
  });

  it('sendDunning 返回已排队文案', async () => {
    prisma.shop.findUnique.mockResolvedValue({
      shopDomain: 'a.myshopify.com',
      memberships: [{ user: { email: 'owner@test.com' } }],
    });
    prisma.knowledgeSyncJob.create.mockResolvedValue({ id: 'j1' });
    const res = await svc.sendDunning('a.myshopify.com');
    expect(res).toEqual({ message: '已排队催缴提醒', queued: true });
  });
});

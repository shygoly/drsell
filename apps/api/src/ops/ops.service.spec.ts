import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OpsService } from './ops.service';
import { SubscriptionMirrorService } from './subscription-mirror.service';

describe('OpsService', () => {
  const prisma = {
    adminUser: { findMany: jest.fn(), findUnique: jest.fn() },
    shop: { findUnique: jest.fn(), findMany: jest.fn() },
    chatStatDaily: { aggregate: jest.fn() },
    aiUsage: { aggregate: jest.fn() },
    knowledgeSyncJob: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    botSetting: { update: jest.fn() },
    auditLog: { findMany: jest.fn(), count: jest.fn() },
    membership: { count: jest.fn() },
    webhookSecretUse: { findMany: jest.fn() },
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
    prisma.chatStatDaily.aggregate.mockResolvedValue({ _sum: { count: 100 } });
    // AI 用量来自 AiUsage.answers（配额的权威计数器），不再是 AI 消息数。
    prisma.aiUsage.aggregate.mockResolvedValue({ _sum: { answers: 42 } });
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

  describe('订阅闸门观测清单', () => {
    const NOW = new Date('2026-09-09T12:00:00.000Z');
    const day = (n: number) => new Date(NOW.getTime() + n * 86400000);

    it('取订阅必须与闸门同款：orderBy updatedAt desc + take 1', async () => {
      // 控制台若用 subscriptions[0]（无序），同店多条订阅时会指向与闸门不同的行——
      // 说「放行」而闸门实际拦下。这种谎比没有清单更糟，所以锁死查询形状。
      prisma.shop.findMany.mockResolvedValue([]);
      prisma.knowledgeSyncJob.findMany.mockResolvedValue([]);
      await svc.subscriptionGate(NOW);
      const arg = prisma.shop.findMany.mock.calls[0][0];
      expect(arg.select.subscriptions).toMatchObject({
        orderBy: { updatedAt: 'desc' },
        take: 1,
      });
    });

    it('逐店给出判定、原因与镜像可信度', async () => {
      prisma.shop.findMany.mockResolvedValue([
        {
          id: 's1',
          shopDomain: 'expired.myshopify.com',
          subscriptions: [
            {
              status: 'ACTIVE',
              planCode: 'basic',
              trialEnds: null,
              currentPeriodEnd: day(-365),
              isTest: false,
              updatedAt: day(-1),
            },
          ],
        },
        {
          id: 's2',
          shopDomain: 'devstore.myshopify.com',
          subscriptions: [
            {
              status: 'ACTIVE',
              planCode: 'basic',
              trialEnds: null,
              currentPeriodEnd: day(-365),
              isTest: true,
              updatedAt: day(-1),
            },
          ],
        },
        { id: 's3', shopDomain: 'nosub.myshopify.com', subscriptions: [] },
      ]);
      prisma.knowledgeSyncJob.findMany.mockResolvedValue([
        { shopDomain: 'expired.myshopify.com', createdAt: day(-1) },
      ]);

      const view = await svc.subscriptionGate(NOW);
      expect(view.enforcing).toBe(false);
      expect(view.blockedCount).toBe(2);
      // 从未同步过的镜像不可信，据此停服就是误停——必须能一眼看出来
      expect(view.neverSyncedCount).toBe(2);

      const byDomain = Object.fromEntries(view.shops.map((r) => [r.shopDomain, r]));
      expect(byDomain['expired.myshopify.com']).toMatchObject({
        serviceable: false,
        reason: 'period-ended',
        lastSyncedAt: day(-1).toISOString(),
      });
      // 开发店的测试订阅照常放行——Shopify 审核员用的就是这种店
      expect(byDomain['devstore.myshopify.com']).toMatchObject({
        serviceable: true,
        reason: 'test',
        isTest: true,
      });
      expect(byDomain['nosub.myshopify.com']).toMatchObject({
        serviceable: false,
        reason: 'no-subscription',
        lastSyncedAt: null,
      });
    });

    it('enforcing 反映真实开关，否则没人知道清单是「会拦」还是「已在拦」', async () => {
      prisma.shop.findMany.mockResolvedValue([]);
      prisma.knowledgeSyncJob.findMany.mockResolvedValue([]);
      const prev = process.env.SUBSCRIPTION_GATE_ENFORCE;
      process.env.SUBSCRIPTION_GATE_ENFORCE = 'true';
      try {
        expect((await svc.subscriptionGate(NOW)).enforcing).toBe(true);
      } finally {
        if (prev === undefined) delete process.env.SUBSCRIPTION_GATE_ENFORCE;
        else process.env.SUBSCRIPTION_GATE_ENFORCE = prev;
      }
    });
  });

  describe('旧 webhook 密钥能否删除', () => {
    const NOW = new Date('2026-09-09T12:00:00.000Z');
    const ago = (d: number) => new Date(NOW.getTime() - d * 86400000);
    const row = (generation: string, topic: string, lastSeenAt: Date) => ({
      generation,
      topic,
      count: 3,
      firstSeenAt: ago(60),
      lastSeenAt,
    });
    let prev: string | undefined;
    beforeEach(() => {
      prev = process.env.SHOPIFY_API_SECRET_PREVIOUS;
      process.env.SHOPIFY_API_SECRET_PREVIOUS = 'old';
    });
    afterEach(() => {
      if (prev === undefined) delete process.env.SHOPIFY_API_SECRET_PREVIOUS;
      else process.env.SHOPIFY_API_SECRET_PREVIOUS = prev;
    });

    it('还有 topic 只在旧密钥下出现过 → 不能删', async () => {
      // 2026-09-09 的实况：app/scopes_update 仍用旧密钥签，其他 topic 已切。
      // 只看整体会漏掉它，删掉旧密钥后这个 topic 全挂。
      prisma.webhookSecretUse.findMany.mockResolvedValue([
        row('current', 'app_subscriptions/update', ago(1)),
        row('previous', 'app/scopes_update', ago(1)),
      ]);
      const r = await svc.webhookSecretStatus(NOW);
      expect(r.safeToDelete).toBe(false);
      expect(r.stillOnPreviousTopics).toEqual(['app/scopes_update']);
    });

    it('每个 topic 都已改用新密钥、且旧密钥静默够久 → 可以删', async () => {
      prisma.webhookSecretUse.findMany.mockResolvedValue([
        row('current', 'app/scopes_update', ago(1)),
        row('current', 'app_subscriptions/update', ago(1)),
        row('previous', 'app/scopes_update', ago(30)),
      ]);
      const r = await svc.webhookSecretStatus(NOW);
      expect(r.safeToDelete).toBe(true);
      expect(r.quietForDays).toBe(30);
    });

    it('topic 已全部切换但旧密钥刚刚还在用 → 静默期不够，仍不能删', async () => {
      prisma.webhookSecretUse.findMany.mockResolvedValue([
        row('current', 'app/scopes_update', ago(0)),
        row('previous', 'app/scopes_update', ago(1)),
      ]);
      expect((await svc.webhookSecretStatus(NOW)).safeToDelete).toBe(false);
    });

    it('一条观测都没有时不下结论——那只说明还没人发过 webhook', async () => {
      prisma.webhookSecretUse.findMany.mockResolvedValue([]);
      const r = await svc.webhookSecretStatus(NOW);
      expect(r.safeToDelete).toBe(false);
      expect(r.lastPreviousAt).toBeNull();
    });

    it('旧密钥本来就没配 → 无事可删', async () => {
      delete process.env.SHOPIFY_API_SECRET_PREVIOUS;
      prisma.webhookSecretUse.findMany.mockResolvedValue([
        row('current', 'app/scopes_update', ago(1)),
      ]);
      const r = await svc.webhookSecretStatus(NOW);
      expect(r.previousSecretConfigured).toBe(false);
      expect(r.safeToDelete).toBe(false);
    });
  });
});

import { QuotaService } from './quota.service';

/**
 * 镜像补同步（openspec subscription-mirror-without-webhooks 的 D2）。
 *
 * app_subscriptions/update 自 2026-04-28 起已不再由 Shopify 发送，而它曾是
 * syncFromShopify 的唯一调用方——生产上镜像因此停了整整一年。取消与冻结不产生
 * 任何回跳，只能靠这条路径收敛。
 */
const NOW = new Date('2026-09-09T12:00:00.000Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3600000);

function makeSvc(sub: Record<string, unknown> | null, installedAt: Date | null = hoursAgo(24 * 30)) {
  const sync = jest.fn().mockResolvedValue(null);
  const prisma = {
    shop: { findFirst: jest.fn().mockResolvedValue(sub || installedAt ? { id: 's1', installedAt } : null) },
    subscription: { findFirst: jest.fn().mockResolvedValue(sub) },
    aiAnswerLog: { count: jest.fn().mockResolvedValue(0) },
  };
  return { svc: new QuotaService(prisma as never, { syncFromShopify: sync } as never), sync };
}

const active = (updatedAt: Date) => ({
  status: 'ACTIVE',
  planCode: 'basic',
  trialEnds: null,
  currentPeriodEnd: new Date(NOW.getTime() + 10 * 86400000),
  isTest: false,
  updatedAt,
});

describe('订阅镜像按陈旧度补同步', () => {
  it('镜像新鲜 → 不触发同步', async () => {
    const { svc, sync } = makeSvc(active(hoursAgo(1)));
    await svc.assertSubscriptionServiceable('a.myshopify.com', NOW);
    expect(sync).not.toHaveBeenCalled();
  });

  it('镜像超过陈旧阈值 → 触发一次同步', async () => {
    const { svc, sync } = makeSvc(active(hoursAgo(24)));
    await svc.assertSubscriptionServiceable('a.myshopify.com', NOW);
    expect(sync).toHaveBeenCalledWith('a.myshopify.com');
  });

  it('压根没有镜像 → 也触发（刚装完选了套餐、我们还不知道）', async () => {
    const { svc, sync } = makeSvc(null);
    await svc.assertSubscriptionServiceable('a.myshopify.com', NOW);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('判定不等同步——同步未完成也立刻返回结果', async () => {
    const { svc } = makeSvc(active(hoursAgo(24)));
    // syncFromShopify 永不 resolve：判定仍须返回
    const svc2 = new QuotaService(
      {
        shop: { findFirst: jest.fn().mockResolvedValue({ id: 's1', installedAt: hoursAgo(720) }) },
        subscription: { findFirst: jest.fn().mockResolvedValue(active(hoursAgo(24))) },
      } as never,
      { syncFromShopify: jest.fn(() => new Promise(() => {})) } as never,
    );
    const r = await svc2.assertSubscriptionServiceable('a.myshopify.com', NOW);
    expect(r.serviceable).toBe(true);
    void svc;
  });

  it('同店短时间内多次判定只触发一次同步', async () => {
    const { svc, sync } = makeSvc(active(hoursAgo(24)));
    await svc.assertSubscriptionServiceable('a.myshopify.com', NOW);
    await svc.assertSubscriptionServiceable('a.myshopify.com', new Date(NOW.getTime() + 60_000));
    await svc.assertSubscriptionServiceable('a.myshopify.com', new Date(NOW.getTime() + 120_000));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('冷却期过后可再次触发', async () => {
    const { svc, sync } = makeSvc(active(hoursAgo(24)));
    await svc.assertSubscriptionServiceable('a.myshopify.com', NOW);
    await svc.assertSubscriptionServiceable('a.myshopify.com', new Date(NOW.getTime() + 6 * 60_000));
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('同步抛错不影响判定，也不让下一条消息立刻重试', async () => {
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 's1', installedAt: hoursAgo(720) }) },
      subscription: { findFirst: jest.fn().mockResolvedValue(active(hoursAgo(24))) },
    };
    const sync = jest.fn().mockRejectedValue(new Error('upstream down'));
    const svc = new QuotaService(prisma as never, { syncFromShopify: sync } as never);
    const r = await svc.assertSubscriptionServiceable('a.myshopify.com', NOW);
    expect(r.serviceable).toBe(true);
    await svc.assertSubscriptionServiceable('a.myshopify.com', new Date(NOW.getTime() + 60_000));
    expect(sync).toHaveBeenCalledTimes(1); // 失败也算一次尝试
  });

  it('刚安装未选套餐 → 闸门放行（install-grace），且触发同步去问 Shopify', async () => {
    const { svc, sync } = makeSvc(null, hoursAgo(2));
    const r = await svc.assertSubscriptionServiceable('a.myshopify.com', NOW);
    expect(r.serviceable).toBe(true);
    expect(r.reason).toBe('install-grace');
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

import { PLANS } from '@drsell/shared';
import { QuotaExceededError, QuotaService } from './quota.service';

/**
 * 配额直接决定收多少钱、拦不拦对话，算错就是多收或漏收。
 * 这里用假 prisma 覆盖边界：刚好用满、超出、无订阅回落、成功才计数。
 */
function makePrisma(opts: {
  shop?: { id: string } | null;
  sub?: { planCode?: string; currentPeriodEnd?: Date | null } | null;
  answers?: number;
}) {
  const upserts: Array<Record<string, unknown>> = [];
  return {
    upserts,
    client: {
      shop: {
        // 注意区分「未传」与「显式 null」：null ?? 默认值 会落回默认值，
        // 会让「店铺不存在」这类用例悄悄失效。
        findFirst: jest
          .fn()
          .mockResolvedValue('shop' in opts ? opts.shop : { id: 'shop_1' }),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(opts.sub ?? null),
      },
      aiUsage: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.answers === undefined ? null : { answers: opts.answers },
          ),
        upsert: jest.fn().mockImplementation((args: Record<string, unknown>) => {
          upserts.push(args);
          return Promise.resolve({});
        }),
      },
    },
  };
}

describe('QuotaService', () => {
  it('无订阅时回落自然月，并按 basic 档给额度', async () => {
    const { client } = makePrisma({ sub: null, answers: 10 });
    const svc = new QuotaService(client as never);
    const u = await svc.usage('a.myshopify.com');

    expect(u.planCode).toBe('basic');
    expect(u.limit).toBe(PLANS.basic.answersPerPeriod);
    expect(u.used).toBe(10);
    expect(u.remaining).toBe(PLANS.basic.answersPerPeriod - 10);
    expect(u.exhausted).toBe(false);
    expect(new Date(u.periodStart).getUTCDate()).toBe(1);
  });

  it('周期起点由订阅当期结束倒推 30 天，而不是自然月', async () => {
    const end = new Date('2026-09-20T00:00:00.000Z');
    const { client } = makePrisma({ sub: { planCode: 'pro', currentPeriodEnd: end } });
    const svc = new QuotaService(client as never);
    const start = await svc.periodStart('shop_1');

    expect(start.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });

  it('周期锚点已过期时按整周期推进到当期，而不是钉死在陈旧周期', async () => {
    // 生产上真有这种数据：一条历史订阅的 currentPeriodEnd 停在一年前。
    // 若直接倒推，配额窗口永远落在过去，用满一次就永久被拦。
    const stale = new Date('2025-08-25T00:00:00.000Z');
    const { client } = makePrisma({ sub: { planCode: 'basic', currentPeriodEnd: stale } });
    const svc = new QuotaService(client as never);
    const start = await svc.periodStart('shop_1');

    const now = Date.now();
    const periodMs = 30 * 24 * 60 * 60 * 1000;
    expect(start.getTime()).toBeLessThanOrEqual(now);
    expect(start.getTime() + periodMs).toBeGreaterThan(now);
    // 仍与扣费日对齐：与原锚点的间隔是整周期数
    const deltaDays = Math.round((start.getTime() - stale.getTime()) / 86400000);
    expect(deltaDays % 30).toBe(0);
  });

  it('周期锚点在未来时保持不变（正常续费中的订阅）', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const { client } = makePrisma({ sub: { planCode: 'pro', currentPeriodEnd: future } });
    const svc = new QuotaService(client as never);
    const start = await svc.periodStart('shop_1');
    const expected = new Date(future);
    expected.setUTCDate(expected.getUTCDate() - 30);
    expected.setUTCHours(0, 0, 0, 0);
    expect(start.toISOString()).toBe(expected.toISOString());
  });

  it('pro 档额度为 5000，basic 为 1500', () => {
    expect(PLANS.pro.answersPerPeriod).toBe(5000);
    expect(PLANS.basic.answersPerPeriod).toBe(1500);
    expect(PLANS.pro.price).toBe(30);
    expect(PLANS.basic.price).toBe(15);
  });

  it('刚好用满即为超额——limit 是上限不是「再来一次」', async () => {
    const { client } = makePrisma({
      sub: { planCode: 'basic', currentPeriodEnd: new Date('2026-09-20T00:00:00.000Z') },
      answers: PLANS.basic.answersPerPeriod,
    });
    const svc = new QuotaService(client as never);
    const u = await svc.usage('a.myshopify.com');

    expect(u.exhausted).toBe(true);
    expect(u.remaining).toBe(0);
    await expect(svc.assertWithinQuota('a.myshopify.com')).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('差一次时仍放行', async () => {
    const { client } = makePrisma({
      sub: { planCode: 'basic', currentPeriodEnd: new Date('2026-09-20T00:00:00.000Z') },
      answers: PLANS.basic.answersPerPeriod - 1,
    });
    const svc = new QuotaService(client as never);
    await expect(svc.assertWithinQuota('a.myshopify.com')).resolves.toMatchObject({
      remaining: 1,
      exhausted: false,
    });
  });

  it('recordAnswer 对同一 (店铺, 周期) 做递增 upsert', async () => {
    const { client, upserts } = makePrisma({
      sub: { planCode: 'pro', currentPeriodEnd: new Date('2026-09-20T00:00:00.000Z') },
    });
    const svc = new QuotaService(client as never);
    await svc.recordAnswer('a.myshopify.com');

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      create: { shopId: 'shop_1', answers: 1 },
      update: { answers: { increment: 1 } },
    });
  });

  it('计数失败不抛错——回答已经给到顾客了，不能因记账失败而报错', async () => {
    const { client } = makePrisma({ sub: null });
    client.aiUsage.upsert = jest.fn().mockRejectedValue(new Error('db down'));
    const svc = new QuotaService(client as never);
    await expect(svc.recordAnswer('a.myshopify.com')).resolves.toBeUndefined();
  });

  it('店铺记录不存在时不写计数，且不抛错', async () => {
    const { client, upserts } = makePrisma({ shop: null, sub: null });
    const svc = new QuotaService(client as never);
    await expect(svc.recordAnswer('ghost.myshopify.com')).resolves.toBeUndefined();
    expect(upserts).toHaveLength(0);
  });

  it('未知 planCode 落到 basic，不会给出无限额度', async () => {
    const { client } = makePrisma({
      sub: { planCode: 'enterprise-typo', currentPeriodEnd: new Date('2026-09-20T00:00:00.000Z') },
      answers: 0,
    });
    const svc = new QuotaService(client as never);
    const u = await svc.usage('a.myshopify.com');
    expect(u.planCode).toBe('basic');
    expect(u.limit).toBe(PLANS.basic.answersPerPeriod);
  });
});

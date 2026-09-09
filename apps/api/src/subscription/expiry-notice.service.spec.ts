import { ExpiryNoticeService } from './expiry-notice.service';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86400000);

/**
 * 假 prisma。唯一键冲突用 `seen` 集合模拟——去重是这套机制的核心：
 * 多实例和重启都会重复触发，靠 DB 唯一键挡住，不能靠进程内记忆。
 */
function makePrisma(subs: unknown[]) {
  const seen = new Set<string>();
  const updates: Array<Record<string, unknown>> = [];
  return {
    seen,
    updates,
    client: {
      subscription: { findMany: jest.fn().mockResolvedValue(subs) },
      expiryNotice: {
        create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
          const k = `${args.data.shopId}|${(args.data.periodEnd as Date).toISOString()}|${args.data.dayOffset}`;
          if (seen.has(k)) return Promise.reject(new Error('unique constraint'));
          seen.add(k);
          return Promise.resolve({ id: k });
        }),
        update: jest.fn().mockImplementation((args: Record<string, unknown>) => {
          updates.push(args);
          return Promise.resolve({});
        }),
      },
    },
  };
}

const sub = (periodEnd: Date, email: string | null = 'owner@test.com') => ({
  shopId: 'shop_1',
  currentPeriodEnd: periodEnd,
  planCode: 'basic',
  shop: {
    shopDomain: 'a.myshopify.com',
    memberships: email ? [{ user: { email } }] : [],
  },
});

const okMail = () => ({ sendExpiryNotice: jest.fn().mockResolvedValue(undefined) });

describe('到期提醒', () => {
  it('D-3 命中一次', async () => {
    const p = makePrisma([sub(day(3))]);
    const svc = new ExpiryNoticeService(p.client as never, okMail() as never);
    expect(await svc.sweep(NOW)).toBe(1);
  });

  it('同一天重复执行只发一次——多实例与重启都不重复打扰商家', async () => {
    const p = makePrisma([sub(day(2))]);
    const mail = okMail();
    const svc = new ExpiryNoticeService(p.client as never, mail as never);

    expect(await svc.sweep(NOW)).toBe(1);
    expect(await svc.sweep(NOW)).toBe(0);
    expect(await svc.sweep(NOW)).toBe(0);
    expect(mail.sendExpiryNotice).toHaveBeenCalledTimes(1);
  });

  it('三个档位各发一次，共三次', async () => {
    const periodEnd = day(3);
    const p = makePrisma([sub(periodEnd)]);
    const mail = okMail();
    const svc = new ExpiryNoticeService(p.client as never, mail as never);

    // 同一个 periodEnd，随时间推进逐日扫过 D-3 / D-2 / D-1
    await svc.sweep(NOW);
    await svc.sweep(new Date(NOW.getTime() + 86400000));
    await svc.sweep(new Date(NOW.getTime() + 2 * 86400000));

    expect(mail.sendExpiryNotice).toHaveBeenCalledTimes(3);
    expect([...p.seen].map((k) => k.split('|')[2]).sort()).toEqual(['1', '2', '3']);
  });

  it('续费后针对旧周期的剩余提醒不再发出', async () => {
    const p = makePrisma([sub(day(3))]);
    const mail = okMail();
    const svc = new ExpiryNoticeService(p.client as never, mail as never);
    await svc.sweep(NOW); // D-3 发出

    // 商家续费：periodEnd 后移，旧周期不再落在窗口内
    p.client.subscription.findMany = jest.fn().mockResolvedValue([sub(day(33))]);
    expect(await svc.sweep(new Date(NOW.getTime() + 86400000))).toBe(0);
    expect(mail.sendExpiryNotice).toHaveBeenCalledTimes(1);
  });

  it('新周期重新计数', async () => {
    const p = makePrisma([sub(day(3))]);
    const mail = okMail();
    const svc = new ExpiryNoticeService(p.client as never, mail as never);
    await svc.sweep(NOW);

    // 新周期（不同 periodEnd）→ 去重键不同，D-3 重新发
    p.client.subscription.findMany = jest.fn().mockResolvedValue([sub(day(33))]);
    expect(await svc.sweep(new Date(NOW.getTime() + 30 * 86400000))).toBe(1);
    expect(mail.sendExpiryNotice).toHaveBeenCalledTimes(2);
  });

  it('发送失败要落库且可被发现——不能像 sendDunning 那样静默丢弃', async () => {
    const p = makePrisma([sub(day(1))]);
    const mail = {
      sendExpiryNotice: jest.fn().mockRejectedValue(new Error('outbound email channel is not configured')),
    };
    const svc = new ExpiryNoticeService(p.client as never, mail as never);

    expect(await svc.sweep(NOW)).toBe(0);
    const rec = JSON.stringify(p.updates);
    expect(rec).toContain('"delivered":false');
    expect(rec).toContain('outbound email channel is not configured');
  });

  it('没有店主邮箱时记下原因，不假装发过', async () => {
    const p = makePrisma([sub(day(1), null)]);
    const mail = okMail();
    const svc = new ExpiryNoticeService(p.client as never, mail as never);

    expect(await svc.sweep(NOW)).toBe(0);
    expect(mail.sendExpiryNotice).not.toHaveBeenCalled();
    expect(JSON.stringify(p.updates)).toContain('no owner email');
  });

  it('窗口外的订阅不发', async () => {
    const p = makePrisma([sub(day(10))]);
    const mail = okMail();
    const svc = new ExpiryNoticeService(p.client as never, mail as never);
    expect(await svc.sweep(NOW)).toBe(0);
    expect(mail.sendExpiryNotice).not.toHaveBeenCalled();
  });
});

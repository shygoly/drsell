import { NotFoundException } from '@nestjs/common';
import { ChatMessageRole, ChatThreadStatus } from '@prisma/client';
import { ConversationService } from '../conversation/conversation.service';
import { StorefrontDashboardService } from './storefront-dashboard.service';

const SHOP = 'a.myshopify.com';

function makePrisma(opts: {
  thread?: Record<string, unknown> | null;
  daily?: Array<Record<string, unknown>>;
  sums?: { threadCount: number | null; humanThreadCount: number | null };
  asked?: Array<{ threadId: string; _min: { createdAt: Date | null } }>;
  answered?: Array<{ threadId: string; _min: { createdAt: Date | null } }>;
}) {
  const threadUpdates: Array<Record<string, unknown>> = [];
  const statUpserts: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];

  const thread =
    opts.thread === undefined
      ? {
          id: 't1',
          shopDomain: SHOP,
          visitorId: 'v1',
          status: ChatThreadStatus.ai,
          unread: 3,
          handedOverAt: null,
          closedAt: null,
          updatedAt: new Date('2026-09-01'),
        }
      : opts.thread;

  const client = {
    chatThread: {
      findUnique: jest.fn().mockResolvedValue(thread),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(2),
      update: jest.fn().mockImplementation((args: Record<string, unknown>) => {
        threadUpdates.push(args);
        return Promise.resolve({ ...thread, ...(args as { data: object }).data });
      }),
    },
    chatMessage: {
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: 'm1', createdAt: new Date(), ...args.data });
      }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve(opts.asked ?? []))
        .mockImplementationOnce(() => Promise.resolve(opts.answered ?? [])),
    },
    chatStatDaily: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(opts.daily ?? []),
      aggregate: jest.fn().mockResolvedValue({
        _sum: opts.sums ?? { threadCount: null, humanThreadCount: null },
      }),
      upsert: jest.fn().mockImplementation((args: Record<string, unknown>) => {
        statUpserts.push(args);
        return Promise.resolve({});
      }),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  };

  const conversations = new ConversationService(client as never);
  const svc = new StorefrontDashboardService(client as never, conversations);
  return { svc, client, threadUpdates, statUpserts, created, conversations };
}

describe('商家写路径', () => {
  it('接管落到服务端，写入 human 与 handedOverAt', async () => {
    const { svc, threadUpdates } = makePrisma({});

    const r = await svc.takeOver('t1', SHOP);

    expect(r.status).toBe(ChatThreadStatus.human);
    const patch = JSON.stringify(threadUpdates[0]);
    expect(patch).toContain(`"status":"${ChatThreadStatus.human}"`);
    expect(patch).toContain('handedOverAt');
    // 接管即读完：未读不该继续挂在那儿。
    expect(patch).toContain('"unread":0');
  });

  it('回复以 role=agent 落库，且隐含接管', async () => {
    const { svc, created, threadUpdates } = makePrisma({});

    const r = await svc.reply('t1', SHOP, '已经帮您补发了');

    // 旧前端把商家消息标成 user——那会让模型把商家的话当成顾客说的。
    expect(created[0].role).toBe(ChatMessageRole.agent);
    expect(r.threadStatus).toBe(ChatThreadStatus.human);
    expect(JSON.stringify(threadUpdates)).toContain(`"status":"${ChatThreadStatus.human}"`);
  });

  it('空回复被拒，不写库', async () => {
    const { svc, created } = makePrisma({});

    await expect(svc.reply('t1', SHOP, '   ')).rejects.toThrow(/required/);
    expect(created).toHaveLength(0);
  });

  it('关闭写入 closed 与 closedAt', async () => {
    const { svc, threadUpdates } = makePrisma({});

    const r = await svc.close('t1', SHOP);

    expect(r.status).toBe(ChatThreadStatus.closed);
    expect(JSON.stringify(threadUpdates[0])).toContain('closedAt');
  });

  it('跨店一律 404，且不改动目标会话', async () => {
    const { svc, threadUpdates, created } = makePrisma({
      thread: {
        id: 't1',
        shopDomain: 'other.myshopify.com',
        status: ChatThreadStatus.ai,
        unread: 0,
        handedOverAt: null,
        updatedAt: new Date(),
      },
    });

    // 403 等于确认「这个 id 存在，只是不归你」，会把别家的会话 id 空间暴露成可枚举。
    await expect(svc.takeOver('t1', SHOP)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.reply('t1', SHOP, 'hi')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.close('t1', SHOP)).rejects.toBeInstanceOf(NotFoundException);
    expect(threadUpdates).toHaveLength(0);
    expect(created).toHaveLength(0);
  });
});

describe('会话统计口径', () => {
  it('窗内无会话时分流率返回 null，而不是 0 或 100', async () => {
    const { svc } = makePrisma({ sums: { threadCount: null, humanThreadCount: null } });

    const s = await svc.getStats(SHOP);

    expect(s.aiResolution).toBeNull();
  });

  it('十个会话四个被接管 → 分流率 60%', async () => {
    const { svc } = makePrisma({ sums: { threadCount: 10, humanThreadCount: 4 } });

    const s = await svc.getStats(SHOP);

    expect(s.aiResolution).toBe(60);
  });

  it('无可配对问答时首响时长返回 null，不再拿常量 12 冒充', async () => {
    const { svc } = makePrisma({ asked: [], answered: [] });

    const s = await svc.getStats(SHOP);

    expect(s.avgFirstResponseSec).toBeNull();
  });

  it('首响时长由消息时间戳真实计算', async () => {
    const t0 = new Date('2026-09-08T00:00:00Z');
    const { svc } = makePrisma({
      asked: [
        { threadId: 'a', _min: { createdAt: t0 } },
        { threadId: 'b', _min: { createdAt: t0 } },
      ],
      answered: [
        { threadId: 'a', _min: { createdAt: new Date(t0.getTime() + 10_000) } },
        { threadId: 'b', _min: { createdAt: new Date(t0.getTime() + 20_000) } },
      ],
    });

    const s = await svc.getStats(SHOP);

    expect(s.avgFirstResponseSec).toBe(15);
  });

  it('图表两个序列都以会话数计，人工不重复计入 AI', async () => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const { svc } = makePrisma({
      daily: [{ day, threadCount: 10, humanThreadCount: 4 }],
    });

    const points = await svc.getChart(SHOP);
    const label = `${day.getUTCMonth() + 1}/${day.getUTCDate()}`;
    const p = points.find((x) => x.label === label);

    // maxTotal = 10 → ai 6/10 = 60%，human 4/10 = 40%，两者之和不超过会话总数。
    expect(p).toEqual({ label, ai: 60, human: 40 });
  });
});

describe('ConversationService 计数幂等', () => {
  it('同一天重复接管只计一次人工', async () => {
    const now = new Date();
    const base = {
      id: 't1',
      shopDomain: SHOP,
      status: ChatThreadStatus.ai,
      unread: 0,
      handedOverAt: null as Date | null,
      updatedAt: now,
    };
    const { conversations, statUpserts } = makePrisma({});

    await conversations.markHandedOver(base as never, now);
    // 第二次：handedOverAt 已落在今天
    await conversations.markHandedOver({ ...base, handedOverAt: now } as never, now);

    expect(JSON.stringify(statUpserts[0])).toContain('humanThreadCount');
    // 商家反复点接管，不该把 human 序列刷成大于会话总数。
    expect(JSON.stringify(statUpserts[1].update)).not.toContain('humanThreadCount');
  });

  it('当天没活动过的会话被接管时补计一次会话', async () => {
    const now = new Date();
    const { conversations, statUpserts } = makePrisma({});

    await conversations.markHandedOver(
      {
        id: 't1',
        shopDomain: SHOP,
        status: ChatThreadStatus.ai,
        unread: 0,
        handedOverAt: null,
        updatedAt: new Date('2026-01-01'),
      } as never,
      now,
    );

    // 否则 ai = threadCount - humanThreadCount 会算成负数。
    expect(JSON.stringify(statUpserts[0].update)).toContain('threadCount');
  });
});

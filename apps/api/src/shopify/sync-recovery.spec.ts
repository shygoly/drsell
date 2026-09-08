import { ShopifyService } from './shopify.service';

/**
 * F3：runSyncJob 是 void 出去的进程内异步。进程在同步中途重启，job 就永远停在
 * 'running'，而 startBatchSync 的并发守卫（if (running) continue）会让该店该类目
 * 再也不启动同步——商品目录静默陈旧，agent 继续拿旧数据回答顾客，无任何告警。
 *
 * 这里只测启动清理的判定条件：谁该被释放、谁不该被误杀。
 */
function makePrisma() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    client: {
      knowledgeSyncJob: {
        updateMany: jest.fn().mockImplementation((args: Record<string, unknown>) => {
          calls.push(args);
          return Promise.resolve({ count: 2 });
        }),
      },
    },
  };
}

function build(prisma: unknown) {
  return new ShopifyService(
    prisma as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
}

describe('同步任务的启动清理', () => {
  it('只释放 running 且心跳停摆的任务', async () => {
    const { client, calls } = makePrisma();

    await build(client).onModuleInit();

    expect(calls).toHaveLength(1);
    const where = calls[0].where as {
      status: string;
      OR: Array<Record<string, unknown>>;
    };
    expect(where.status).toBe('running');
    // 没有心跳字段的存量行，正是上一个进程留下的尸体。
    expect(where.OR).toContainEqual({ heartbeatAt: null });
    const stale = where.OR.find((c) => 'heartbeatAt' in c && c.heartbeatAt !== null) as {
      heartbeatAt: { lt: Date };
    };
    expect(stale.heartbeatAt.lt).toBeInstanceOf(Date);
    // 阈值必须落在过去——写成未来会把正在跑的任务全杀掉。
    expect(stale.heartbeatAt.lt.getTime()).toBeLessThan(Date.now());
  });

  it('判定基于心跳而不是创建时间', async () => {
    const { client, calls } = makePrisma();

    await build(client).onModuleInit();

    // 按 createdAt 判会误杀上万商品的健康长任务。
    expect(JSON.stringify(calls[0].where)).not.toContain('createdAt');
  });

  it('释放后写入的是终态与可读原因，而不是留在 running', async () => {
    const { client, calls } = makePrisma();

    await build(client).onModuleInit();

    const data = calls[0].data as { status: string; payload: string };
    expect(data.status).toBe('failed');
    // 商家看到 failed 时要能分清是进程中断还是 Shopify 报错。
    expect(data.payload).toContain('进程中断');
  });

  it('清理失败不拦启动', async () => {
    const client = {
      knowledgeSyncJob: {
        updateMany: jest.fn().mockRejectedValue(new Error('db down')),
      },
    };

    await expect(build(client).onModuleInit()).resolves.toBeUndefined();
  });
});

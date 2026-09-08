import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageRole, ChatThread, ChatThreadStatus } from '@prisma/client';
import type { OpenClawMessage } from '@drsell/openclaw';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 会话状态的唯一写入口。
 *
 * 这个 change 的根因是「会话状态从来没有被当成有状态的东西对待」：
 * 谁在应答散落在前端 React state 里，说到哪了散落在 OpenClaw session 里，
 * 数据库只留了一份为渲染列表而存在的物化。这里把所有权收回来——
 * AI 链路（AdpService）和商家链路（StorefrontDashboardService）都只能经过本服务
 * 改会话状态，否则又会长出第二处真相。
 */

/** 单次请求带给模型的最大历史条数。够覆盖多轮追问，又不让请求体随会话无限增长。 */
export const CONTEXT_MESSAGE_LIMIT = 20;

export function startOfUtcDay(d: Date): Date {
  const day = new Date(d);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取会话并校验店铺归属。
   *
   * 跨店一律 404 而非 403：403 等于确认「这个 id 存在，只是不归你」，
   * 会把别家店的会话 id 空间暴露成可枚举的。
   */
  async getOwnedThread(threadId: string, shopDomain: string): Promise<ChatThread> {
    const thread = await this.prisma.chatThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.shopDomain !== shopDomain) {
      throw new NotFoundException('thread not found');
    }
    return thread;
  }

  /**
   * 当天首次活动才计一次会话。
   *
   * `count`（消息数）是旧口径，ops 的 chatCount 仍在读，继续写；
   * `threadCount` 是图表和分流率的新分母，按会话计。
   */
  async recordActivity(
    shopDomain: string,
    /** 本会话上一次活动的时刻；新建会话传 null——它当然是今天首次。 */
    previousActivityAt: Date | null,
    now = new Date(),
  ) {
    const day = startOfUtcDay(now);
    const firstToday =
      previousActivityAt == null ||
      startOfUtcDay(previousActivityAt).getTime() < day.getTime();
    await this.prisma.chatStatDaily.upsert({
      where: { shopDomain_day: { shopDomain, day } },
      create: {
        shopDomain,
        day,
        count: 1,
        threadCount: firstToday ? 1 : 0,
      },
      update: {
        count: { increment: 1 },
        ...(firstToday ? { threadCount: { increment: 1 } } : {}),
      },
    });
  }

  /**
   * 转人工。
   *
   * 幂等到「每会话每天一次」：`handedOverAt` 已落在今天就不再计数，
   * 否则商家反复点接管会把 human 序列刷成大于会话总数。
   *
   * 当天没有活动过的会话在这里补计 threadCount——否则
   * `ai = threadCount - humanThreadCount` 会算成负数。
   */
  async markHandedOver(thread: ChatThread, now = new Date()): Promise<ChatThread> {
    const day = startOfUtcDay(now);
    const alreadyToday =
      thread.handedOverAt != null &&
      startOfUtcDay(thread.handedOverAt).getTime() === day.getTime();
    const activeToday = startOfUtcDay(thread.updatedAt).getTime() === day.getTime();

    const [updated] = await this.prisma.$transaction([
      this.prisma.chatThread.update({
        where: { id: thread.id },
        data: {
          status: ChatThreadStatus.human,
          handedOverAt: now,
          closedAt: null,
          unread: 0,
          updatedAt: now,
        },
      }),
      this.prisma.chatStatDaily.upsert({
        where: { shopDomain_day: { shopDomain: thread.shopDomain, day } },
        create: {
          shopDomain: thread.shopDomain,
          day,
          threadCount: 1,
          humanThreadCount: alreadyToday ? 0 : 1,
        },
        update: {
          ...(activeToday ? {} : { threadCount: { increment: 1 } }),
          ...(alreadyToday ? {} : { humanThreadCount: { increment: 1 } }),
        },
      }),
    ]);
    return updated;
  }

  async close(thread: ChatThread, now = new Date()): Promise<ChatThread> {
    return this.prisma.chatThread.update({
      where: { id: thread.id },
      data: { status: ChatThreadStatus.closed, closedAt: now, unread: 0, updatedAt: now },
    });
  }

  async appendMessage(threadId: string, role: ChatMessageRole, content: string) {
    return this.prisma.chatMessage.create({ data: { threadId, role, content } });
  }

  /**
   * 从本地库组装模型上下文。
   *
   * 只截最近若干条，且不从中间随机丢弃——问答错位比上下文短更糟。
   * 商家的 `agent` 消息映射到 assistant 侧：它是「店家说的话」，
   * 不是顾客说的，映射错会让模型把商家的承诺当成顾客的要求。
   */
  async buildContext(threadId: string, limit = CONTEXT_MESSAGE_LIMIT): Promise<OpenClawMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });
    return rows
      .reverse()
      .map((m) => ({
        role: m.role === ChatMessageRole.user ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));
  }

  /** 顾客侧增量拉取：只回该游标之后的消息。 */
  async messagesAfter(threadId: string, afterId?: string) {
    let cursorAt: Date | null = null;
    if (afterId) {
      const anchor = await this.prisma.chatMessage.findUnique({
        where: { id: afterId },
        select: { createdAt: true, threadId: true },
      });
      // 游标不属于本会话时当作无游标处理，不泄露它是否存在。
      if (anchor && anchor.threadId === threadId) cursorAt = anchor.createdAt;
    }
    return this.prisma.chatMessage.findMany({
      where: { threadId, ...(cursorAt ? { createdAt: { gt: cursorAt } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, role: true, content: true, createdAt: true },
    });
  }
}

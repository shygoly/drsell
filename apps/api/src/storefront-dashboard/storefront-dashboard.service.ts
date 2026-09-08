import { BadRequestException, Injectable } from '@nestjs/common';
import { ChatMessageRole, ChatThreadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationService, startOfUtcDay } from '../conversation/conversation.service';

/** 分流率与首响时长的统计窗口。没有窗口的"历史全量"会把去年的会话算进今天的业绩。 */
const WINDOW_DAYS = 30;

/**
 * 会话计数口径的变更日（threadCount / humanThreadCount 上线之日）。
 *
 * 此前只有消息数口径，且 handedOverAt 根本不存在（status='human' 从没被写入过），
 * 所以历史无法回填——回填出来的分流率必然是 100%，是假数据，比缺口更糟。
 * 统计窗一律不早于这一天：宁可图表短一截，也不要把「没有数据」画成一排零，
 * 那会被读成「这些天没人来问」。
 */
const COUNTING_CHANGED_AT = new Date('2026-09-08T00:00:00.000Z');

function formatRelativeTime(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function visitorLabel(visitorId: string): string {
  const short = visitorId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'Guest';
  return short.length >= 2
    ? `${short.slice(0, 1).toUpperCase()}${short.slice(1, 2).toUpperCase()}.`
    : 'Guest';
}

function visitorInitials(visitorId: string): string {
  const clean = visitorId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length >= 2) return clean.slice(0, 2);
  return 'G';
}

function windowStart(now: Date): Date {
  const since = startOfUtcDay(now);
  since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));
  return since < COUNTING_CHANGED_AT ? COUNTING_CHANGED_AT : since;
}

/** 变更日之后实际可统计的天数。图表刻度按它给，不硬凑 30 根柱子。 */
function windowLength(since: Date, now: Date): number {
  const days =
    Math.floor((startOfUtcDay(now).getTime() - since.getTime()) / 86400000) + 1;
  return Math.max(1, Math.min(WINDOW_DAYS, days));
}

@Injectable()
export class StorefrontDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationService,
  ) {}

  async getStats(shopDomain: string) {
    const now = new Date();
    const today = startOfUtcDay(now);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const since = windowStart(now);

    const [todayStat, yesterdayStat, pendingTakeover, windowStats, avgFirstResponseSec] =
      await Promise.all([
        this.prisma.chatStatDaily.findUnique({
          where: { shopDomain_day: { shopDomain, day: today } },
        }),
        this.prisma.chatStatDaily.findUnique({
          where: { shopDomain_day: { shopDomain, day: yesterday } },
        }),
        this.prisma.chatThread.count({
          where: { shopDomain, status: ChatThreadStatus.pending },
        }),
        this.prisma.chatStatDaily.aggregate({
          where: { shopDomain, day: { gte: since } },
          _sum: { threadCount: true, humanThreadCount: true },
        }),
        this.avgFirstResponseSec(shopDomain, since),
      ]);

    // 会话数，不是消息数——字段名叫 conversations，就得数会话。
    const conversationsToday = todayStat?.threadCount ?? 0;
    const yesterdayCount = yesterdayStat?.threadCount ?? 0;
    const conversationsTrendPct =
      yesterdayCount > 0
        ? Math.round(((conversationsToday - yesterdayCount) / yesterdayCount) * 100)
        : conversationsToday > 0
          ? 100
          : 0;

    // 分流率 = 窗内未升级到人工的会话占比。窗内无会话时返回 null——
    // 0% 和 100% 都会被读成真实业绩，而事实是"没有数据"。
    const total = windowStats._sum.threadCount ?? 0;
    const human = windowStats._sum.humanThreadCount ?? 0;
    const aiResolution =
      total > 0 ? Math.round(((total - human) / total) * 100) : null;

    return {
      conversationsToday,
      conversationsTrendPct,
      aiResolution,
      aiResolutionTarget: 70,
      avgFirstResponseSec,
      pendingTakeover,
      // 真实可统计的天数——变更日刚过时它小于 30，标签要如实说 "7d" 而不是 "30d"。
      windowDays: windowLength(since, now),
    };
  }

  /**
   * 首次响应时长：每个会话第一条顾客消息 → 第一条回复（AI 或人工）的间隔均值。
   *
   * 两次 groupBy 取 min(createdAt) 后在内存里配对，避免 N+1。
   * 窗内没有配得上对的会话时返回 null——这里曾经写死成常量 12。
   */
  private async avgFirstResponseSec(
    shopDomain: string,
    since: Date,
  ): Promise<number | null> {
    const [asked, answered] = await Promise.all([
      this.prisma.chatMessage.groupBy({
        by: ['threadId'],
        where: {
          role: ChatMessageRole.user,
          createdAt: { gte: since },
          thread: { shopDomain },
        },
        _min: { createdAt: true },
      }),
      this.prisma.chatMessage.groupBy({
        by: ['threadId'],
        where: {
          role: { in: [ChatMessageRole.assistant, ChatMessageRole.agent] },
          createdAt: { gte: since },
          thread: { shopDomain },
        },
        _min: { createdAt: true },
      }),
    ]);

    const firstReply = new Map(
      answered
        .filter((r) => r._min.createdAt)
        .map((r) => [r.threadId, r._min.createdAt as Date]),
    );

    const deltas: number[] = [];
    for (const row of asked) {
      const askedAt = row._min.createdAt;
      const repliedAt = firstReply.get(row.threadId);
      if (!askedAt || !repliedAt) continue;
      const sec = (repliedAt.getTime() - askedAt.getTime()) / 1000;
      // 负值 = 回复早于窗内第一条提问（会话跨窗边界），不是有效样本。
      if (sec >= 0) deltas.push(sec);
    }
    if (deltas.length === 0) return null;
    return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
  }

  /**
   * 30 天趋势。两个序列都以会话数计、取同一时间窗——
   * 旧实现的 ai 序列数消息、human 序列数会话，堆在同一张图上。
   */
  async getChart(shopDomain: string) {
    const now = new Date();
    const since = windowStart(now);

    const dailyStats = await this.prisma.chatStatDaily.findMany({
      where: { shopDomain, day: { gte: since } },
      orderBy: { day: 'asc' },
    });

    const statByLabel = new Map(
      dailyStats.map((d) => [`${d.day.getUTCMonth() + 1}/${d.day.getUTCDate()}`, d]),
    );

    // 只回有记录的那几天，会让「30 天」图表在新店铺上退化成两三根孤零零的柱子，
    // 看起来像坏了。这里补齐 30 个刻度；整段全为 0 时回空数组，由前端出空态。
    const days: { label: string; ai: number; human: number }[] = [];
    let maxTotal = 0;
    const span = windowLength(since, now);
    for (let i = 0; i < span; i += 1) {
      const day = new Date(since);
      day.setUTCDate(day.getUTCDate() + i);
      const label = `${day.getUTCMonth() + 1}/${day.getUTCDate()}`;
      const stat = statByLabel.get(label);
      const total = stat?.threadCount ?? 0;
      const human = Math.min(stat?.humanThreadCount ?? 0, total);
      const ai = total - human;
      maxTotal = Math.max(maxTotal, total);
      days.push({ label, ai, human });
    }

    if (maxTotal === 0) return [];

    return days.map((d) => ({
      label: d.label,
      ai: Math.round((d.ai / maxTotal) * 100),
      human: Math.round((d.human / maxTotal) * 100),
    }));
  }

  async getConversations(shopDomain: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: { shopDomain },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return threads.map((t) => ({
      id: t.id,
      customer: visitorLabel(t.visitorId),
      avatarInitials: visitorInitials(t.visitorId),
      topic: t.topic ?? 'Conversation',
      preview: t.lastMessage ?? '',
      status: t.status,
      channel: t.channel as 'web' | 'instagram' | 'email' | 'whatsapp',
      time: formatRelativeTime(t.updatedAt),
      unread: t.unread > 0 ? t.unread : undefined,
    }));
  }

  async getSuggestion(_shopDomain: string) {
    return {
      title: 'Knowledge Base Optimization',
      description:
        'Your knowledge base lacks a returns policy answer — add it to resolve ~15% more questions automatically.',
      impact: '-15% takeovers',
    };
  }

  async getThreadMessages(threadId: string, shopDomain: string) {
    const thread = await this.conversations.getOwnedThread(threadId, shopDomain);
    const messages = await this.prisma.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  // ── 商家写路径 ────────────────────────────────────────────────────────────
  // 这三条以前只存在于前端的 React state 里：刷新页面接管就没了，
  // 商家发的消息从未到达顾客，而配额耗尽时我们已经对顾客承诺了人工跟进。

  async takeOver(threadId: string, shopDomain: string) {
    const thread = await this.conversations.getOwnedThread(threadId, shopDomain);
    const updated = await this.conversations.markHandedOver(thread);
    return { id: updated.id, status: updated.status };
  }

  async reply(threadId: string, shopDomain: string, text: string) {
    const body = text.trim();
    if (!body) throw new BadRequestException('reply text is required');
    const thread = await this.conversations.getOwnedThread(threadId, shopDomain);

    const message = await this.conversations.appendMessage(
      thread.id,
      ChatMessageRole.agent,
      body,
    );
    // 发回复隐含接管：商家已经在人工应答了，AI 不该再插话。
    const updated = await this.conversations.markHandedOver(thread);
    await this.prisma.chatThread.update({
      where: { id: thread.id },
      data: { lastMessage: body.length > 120 ? `${body.slice(0, 117)}...` : body },
    });

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      threadStatus: updated.status,
    };
  }

  async close(threadId: string, shopDomain: string) {
    const thread = await this.conversations.getOwnedThread(threadId, shopDomain);
    const updated = await this.conversations.close(thread);
    return { id: updated.id, status: updated.status };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function startOfUtcDay(d: Date): Date {
  const day = new Date(d);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

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

@Injectable()
export class StorefrontDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(shopDomain: string) {
    const today = startOfUtcDay(new Date());
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const [todayStat, yesterdayStat, pendingTakeover, threads] = await Promise.all([
      this.prisma.chatStatDaily.findUnique({
        where: { shopDomain_day: { shopDomain, day: today } },
      }),
      this.prisma.chatStatDaily.findUnique({
        where: { shopDomain_day: { shopDomain, day: yesterday } },
      }),
      this.prisma.chatThread.count({
        where: { shopDomain, status: 'pending' },
      }),
      this.prisma.chatThread.findMany({
        where: { shopDomain },
        select: { status: true },
      }),
    ]);

    const conversationsToday = todayStat?.count ?? 0;
    const yesterdayCount = yesterdayStat?.count ?? 0;
    const conversationsTrendPct =
      yesterdayCount > 0
        ? Math.round(((conversationsToday - yesterdayCount) / yesterdayCount) * 100)
        : conversationsToday > 0
          ? 100
          : 0;

    const totalThreads = threads.length;
    const aiThreads = threads.filter((t) => t.status === 'ai').length;
    const aiResolution =
      totalThreads > 0 ? Math.round((aiThreads / totalThreads) * 100) : 0;

    return {
      conversationsToday,
      conversationsTrendPct,
      aiResolution,
      aiResolutionTarget: 70,
      avgFirstResponseSec: 12,
      avgResponseTrendSec: 0,
      pendingTakeover,
    };
  }

  async getChart(shopDomain: string) {
    const since = startOfUtcDay(new Date());
    since.setUTCDate(since.getUTCDate() - 29);

    const [dailyStats, humanThreads] = await Promise.all([
      this.prisma.chatStatDaily.findMany({
        where: { shopDomain, day: { gte: since } },
        orderBy: { day: 'asc' },
      }),
      this.prisma.chatThread.findMany({
        where: { shopDomain, status: 'human', updatedAt: { gte: since } },
        select: { updatedAt: true },
      }),
    ]);

    const humanMap = new Map<string, number>();
    for (const row of humanThreads) {
      const key = `${row.updatedAt.getUTCMonth() + 1}/${row.updatedAt.getUTCDate()}`;
      humanMap.set(key, (humanMap.get(key) ?? 0) + 1);
    }

    if (dailyStats.length === 0) {
      return [];
    }

    const maxTotal = Math.max(...dailyStats.map((d) => d.count), 1);
    return dailyStats.map((d) => {
      const label = `${d.day.getUTCMonth() + 1}/${d.day.getUTCDate()}`;
      const human = humanMap.get(label) ?? 0;
      const total = d.count;
      const ai = d.aiResolvedCount ?? Math.max(total - human, 0);
      return {
        label,
        ai: Math.round((ai / maxTotal) * 100),
        human: Math.round((human / maxTotal) * 100),
      };
    });
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
      status: t.status as 'ai' | 'pending' | 'human',
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
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!thread) throw new NotFoundException('thread not found');
    if (thread.shopDomain !== shopDomain) {
      throw new NotFoundException('thread not found');
    }
    return thread.messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
  }
}

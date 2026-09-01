import { Injectable, BadRequestException } from '@nestjs/common';
import { createOpenClawClient } from '@drsell/openclaw';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdpService {
  private readonly openclaw = createOpenClawClient();

  constructor(private readonly prisma: PrismaService) {}

  async syncKnowledge(params: {
    shopDomain: string;
    appKey: string;
    title: string;
    content: string;
    externalId: string;
    kind: string;
  }) {
    await this.prisma.knowledgeSyncJob.create({
      data: {
        shopDomain: params.shopDomain,
        kind: params.kind,
        externalId: params.externalId,
        status: 'skipped',
        payload: '知识库同步已停用：OpenClaw 经 adp_reader 实时查 PG（ADR-7）',
      },
    });
    return { skipped: true as const };
  }

  async proxyChatSse(params: {
    shopDomain: string;
    visitorId: string;
    text: string;
    conversationId?: string;
    onChunk: (chunk: string) => void;
    signal?: AbortSignal;
  }) {
    if (!params.shopDomain) throw new BadRequestException('shopDomain required');

    const preview =
      params.text.length > 120 ? `${params.text.slice(0, 117)}...` : params.text;
    const thread = await this.prisma.chatThread.upsert({
      where: {
        shopDomain_visitorId: {
          shopDomain: params.shopDomain,
          visitorId: params.visitorId,
        },
      },
      create: {
        shopDomain: params.shopDomain,
        visitorId: params.visitorId,
        status: 'ai',
        channel: 'web',
        topic: preview,
        lastMessage: preview,
        unread: 0,
      },
      update: {
        lastMessage: preview,
        updatedAt: new Date(),
      },
    });

    let assistantText = '';
    await this.openclaw.chatStream({
      shopDomain: params.shopDomain,
      visitorId: params.visitorId,
      message: params.text,
      conversationId: params.conversationId,
      onChunk: (chunk) => {
        assistantText += chunk;
        params.onChunk(chunk);
      },
      signal: params.signal,
    });

    const assistantPreview =
      assistantText.length > 120
        ? `${assistantText.slice(0, 117)}...`
        : assistantText;

    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { threadId: thread.id, role: 'user', content: params.text },
      }),
      this.prisma.chatMessage.create({
        data: { threadId: thread.id, role: 'assistant', content: assistantText },
      }),
      this.prisma.chatThread.update({
        where: { id: thread.id },
        data: {
          lastMessage: assistantPreview || thread.lastMessage,
          updatedAt: new Date(),
        },
      }),
    ]);

    await this.bumpChatStat(params.shopDomain);
    if (thread.status === 'ai') {
      await this.bumpAiResolvedStat(params.shopDomain);
    }
  }

  async bumpChatStat(shopDomain: string) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    await this.prisma.chatStatDaily.upsert({
      where: { shopDomain_day: { shopDomain, day } },
      create: { shopDomain, day, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  async bumpAiResolvedStat(shopDomain: string) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    await this.prisma.chatStatDaily.upsert({
      where: { shopDomain_day: { shopDomain, day } },
      create: { shopDomain, day, aiResolvedCount: 1 },
      update: { aiResolvedCount: { increment: 1 } },
    });
  }
}

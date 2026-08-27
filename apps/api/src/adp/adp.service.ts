import { Injectable, BadRequestException } from '@nestjs/common';
import { createAdpClient, adpSessionId } from '@drsell/adp';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdpService {
  private readonly client = createAdpClient({
    baseUrl: process.env.ADP_CHAT_URL,
  });

  constructor(private readonly prisma: PrismaService) {}

  async syncKnowledge(params: {
    shopDomain: string;
    appKey: string;
    title: string;
    content: string;
    externalId: string;
    kind: string;
  }) {
    if (!params.appKey) {
      throw new BadRequestException('ADP AppKey not configured for shop');
    }
    const job = await this.prisma.knowledgeSyncJob.create({
      data: {
        shopDomain: params.shopDomain,
        kind: params.kind,
        externalId: params.externalId,
        status: 'running',
        payload: params.title,
      },
    });
    try {
      const result = await this.client.upsertKnowledgeDocument({
        appKey: params.appKey,
        title: params.title,
        content: params.content,
        externalId: params.externalId,
      });
      await this.prisma.knowledgeSyncJob.update({
        where: { id: job.id },
        data: { status: 'ok' },
      });
      return result;
    } catch (e) {
      await this.prisma.knowledgeSyncJob.update({
        where: { id: job.id },
        data: { status: 'error', payload: String(e) },
      });
      throw e;
    }
  }

  async proxyChatSse(params: {
    appKey: string;
    visitorId: string;
    text: string;
    conversationId?: string;
    onChunk: (chunk: string) => void;
    signal?: AbortSignal;
  }) {
    if (!params.appKey) throw new BadRequestException('appKey required');
    await this.client.chatSse(
      {
        RequestId: adpSessionId(),
        ConversationId: params.conversationId || adpSessionId(),
        AppKey: params.appKey,
        VisitorId: params.visitorId,
        Contents: [{ Type: 'text', Text: params.text }],
        Stream: 'enable',
        Incremental: true,
      },
      params.onChunk,
      params.signal,
    );
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
}

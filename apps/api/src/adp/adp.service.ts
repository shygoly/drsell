import { Injectable, BadRequestException } from '@nestjs/common';
import { createOpenClawClient } from '@drsell/openclaw';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaExceededError, QuotaService } from '../quota/quota.service';

/**
 * 额度用尽时给顾客看的话。要点：说明白当前答不了、不怪顾客、给一条出路，
 * 且不暴露商家的套餐或用量——那是商家的商业信息，不该出现在顾客侧。
 */
const QUOTA_EXHAUSTED_REPLY =
  "I'm not able to answer right now. Please leave your question here and the store team will follow up.";

@Injectable()
export class AdpService {
  private readonly openclaw = createOpenClawClient();

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

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

    // 配额闸门：必须在调模型之前。超额就不发上游请求——商家不该为拦下的对话付费。
    try {
      await this.quota.assertWithinQuota(params.shopDomain);
    } catch (e) {
      if (!(e instanceof QuotaExceededError)) throw e;
      params.onChunk(QUOTA_EXHAUSTED_REPLY);
      await this.prisma.$transaction([
        this.prisma.chatMessage.create({
          data: { threadId: thread.id, role: 'user', content: params.text },
        }),
        this.prisma.chatMessage.create({
          data: { threadId: thread.id, role: 'assistant', content: QUOTA_EXHAUSTED_REPLY },
        }),
        // 转成待人工接管：额度用尽的会话必须让商家看得见，否则顾客石沉大海。
        this.prisma.chatThread.update({
          where: { id: thread.id },
          data: {
            status: 'pending',
            lastMessage: QUOTA_EXHAUSTED_REPLY,
            unread: { increment: 1 },
            updatedAt: new Date(),
          },
        }),
      ]);
      return;
    }

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

    // 只有真的产出了内容才算一次 AI 回答——空回复不该扣额度。
    if (assistantText.trim()) {
      await this.quota.recordAnswer(params.shopDomain);
    }

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

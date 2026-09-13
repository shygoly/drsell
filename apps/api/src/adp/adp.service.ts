import { Injectable, BadRequestException } from '@nestjs/common';
import { ChatMessageRole, ChatThread, ChatThreadStatus } from '@prisma/client';
import {
  buildSupportSystemPrompt,
  createOpenClawClient,
  type SupportPersona,
} from '@drsell/openclaw';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationService } from '../conversation/conversation.service';
import {
  QuotaExceededError,
  QuotaService,
  SubscriptionInactiveError,
} from '../quota/quota.service';

/**
 * 额度用尽时给顾客看的话。要点：说明白当前答不了、不怪顾客、给一条出路，
 * 且不暴露商家的套餐或用量——那是商家的商业信息，不该出现在顾客侧。
 *
 * 这句话承诺了人工跟进，所以商家侧必须真的有回复能力（见 conversation-handoff）。
 */
const QUOTA_EXHAUSTED_REPLY =
  "I'm not able to answer right now. Please leave your question here and the store team will follow up.";

/**
 * 订阅失效时给顾客看的话。
 *
 * 与额度耗尽用同一句：顾客不需要、也不该知道差别在哪——套餐、欠费、用量
 * 都是商家的商业信息。差别只体现在商家端（那里要能看出是订阅问题还是额度问题）。
 */
const SUBSCRIPTION_INACTIVE_REPLY = QUOTA_EXHAUSTED_REPLY;

/**
 * 商家在 AI Assistant 页关掉自动应答时给顾客看的话。
 * 与额度耗尽同处理：转人工待接管，并给顾客一句「团队会跟进」，别让顾客石沉大海。
 */
const AI_DISABLED_REPLY =
  'Thanks for your message — the store team will follow up with you here shortly.';

function preview(text: string): string {
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

@Injectable()
export class AdpService {
  private readonly openclaw = createOpenClawClient();

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly conversations: ConversationService,
  ) {}

  /**
   * 沙盒预览：商家在 AI Assistant 页保存前用草稿人设试聊一次。
   * 一次性、不落库、不影响真实会话；店铺域由控制器用会话解析后传入，不取自前端正文。
   * 草稿人设照样走 buildSupportSystemPrompt，护栏在前且不可覆盖（与真实链路同一套）。
   */
  async previewChat(params: {
    shopDomain: string;
    message: string;
    persona?: SupportPersona;
  }): Promise<{ reply: string }> {
    let reply = '';
    await this.openclaw.chatStream({
      shopDomain: params.shopDomain,
      visitorId: `preview:${params.shopDomain}`,
      systemPrompt: buildSupportSystemPrompt(params.shopDomain, params.persona),
      messages: [{ role: 'user', content: params.message }],
      onChunk: (chunk) => {
        reply += chunk;
      },
    });
    return { reply };
  }

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

    const now = new Date();
    const head = preview(params.text);
    const existing = await this.prisma.chatThread.findUnique({
      where: {
        shopDomain_visitorId: {
          shopDomain: params.shopDomain,
          visitorId: params.visitorId,
        },
      },
    });

    const thread: ChatThread = existing
      ? await this.prisma.chatThread.update({
          where: { id: existing.id },
          data: { lastMessage: head, updatedAt: now },
        })
      : await this.prisma.chatThread.create({
          data: {
            shopDomain: params.shopDomain,
            visitorId: params.visitorId,
            status: ChatThreadStatus.ai,
            channel: 'web',
            topic: head,
            lastMessage: head,
            unread: 0,
          },
        });

    // 用户消息在调模型之前落库：上游失败时它不该跟着丢，而且它就是上下文本身。
    await this.conversations.appendMessage(thread.id, ChatMessageRole.user, params.text);
    await this.conversations.recordActivity(
      params.shopDomain,
      existing ? existing.updatedAt : null,
      now,
    );

    // ── 应答闸门 ──────────────────────────────────────────────────────────
    // 必须在配额扣减之前：被拦下的对话不该让商家付费。
    if (thread.status === ChatThreadStatus.human) {
      // 人工已接管，AI 不得抢答。消息留给商家，未读加一，SSE 正常收尾——
      // 报错会让 widget 显示一条红字，而顾客其实什么都没做错。
      await this.prisma.chatThread.update({
        where: { id: thread.id },
        data: { unread: { increment: 1 }, updatedAt: now },
      });
      return;
    }

    if (thread.status === ChatThreadStatus.closed) {
      // 顾客在已结束的会话上又开口 = 新问题，回到 AI。
      await this.prisma.chatThread.update({
        where: { id: thread.id },
        data: { status: ChatThreadStatus.ai, closedAt: null, topic: head, updatedAt: now },
      });
    }

    // 商家可在 AI Assistant 页配置人设并开关 AI。加载一次，供开关判定与 prompt 组装复用。
    const botSetting = await this.prisma.botSetting.findFirst({
      where: { shop: { shopDomain: params.shopDomain } },
      select: {
        aiEnabled: true,
        aiPersonaName: true,
        aiTone: true,
        aiLanguage: true,
        aiSystemPrompt: true,
      },
    });

    // AI 开关：商家关掉自动应答时不调模型、转人工。放在配额闸门之前——AI 关着就不该
    // 消耗额度或产生上游成本。给顾客一句人工跟进（与配额耗尽同处理），别让顾客石沉大海。
    if (botSetting?.aiEnabled === false) {
      params.onChunk(AI_DISABLED_REPLY);
      await this.prisma.$transaction([
        this.prisma.chatMessage.create({
          data: {
            threadId: thread.id,
            role: ChatMessageRole.assistant,
            content: AI_DISABLED_REPLY,
          },
        }),
        this.prisma.chatThread.update({
          where: { id: thread.id },
          data: {
            status: ChatThreadStatus.pending,
            lastMessage: preview(AI_DISABLED_REPLY),
            unread: { increment: 1 },
            updatedAt: now,
          },
        }),
      ]);
      return;
    }

    // 订阅闸门在配额之前：被订阅状态拦下的对话不该消耗商家额度，
    // 也不该产生上游推理成本。默认只观测不拦截，见 QuotaService 的说明。
    try {
      await this.quota.assertSubscriptionServiceable(params.shopDomain, now);
      await this.quota.assertWithinQuota(params.shopDomain);
    } catch (e) {
      if (!(e instanceof QuotaExceededError) && !(e instanceof SubscriptionInactiveError)) {
        throw e;
      }
      const reply =
        e instanceof SubscriptionInactiveError
          ? SUBSCRIPTION_INACTIVE_REPLY
          : QUOTA_EXHAUSTED_REPLY;
      params.onChunk(reply);
      await this.prisma.$transaction([
        this.prisma.chatMessage.create({
          data: {
            threadId: thread.id,
            role: ChatMessageRole.assistant,
            content: reply,
          },
        }),
        // 转成待人工接管：额度用尽的会话必须让商家看得见，否则顾客石沉大海。
        this.prisma.chatThread.update({
          where: { id: thread.id },
          data: {
            status: ChatThreadStatus.pending,
            lastMessage: preview(reply),
            unread: { increment: 1 },
            updatedAt: now,
          },
        }),
      ]);
      return;
    }

    // 配额通过：pending 是「等人工救场」的临时态，额度回来了就该回到 AI。
    if (thread.status === ChatThreadStatus.pending) {
      await this.prisma.chatThread.update({
        where: { id: thread.id },
        data: { status: ChatThreadStatus.ai, updatedAt: now },
      });
    }

    // 上下文从自己的库里组装——网关侧会话丢失也重建得出来。
    const messages = await this.conversations.buildContext(thread.id);

    let assistantText = '';
    await this.openclaw.chatStream({
      shopDomain: params.shopDomain,
      visitorId: params.visitorId,
      conversationId: params.conversationId,
      systemPrompt: buildSupportSystemPrompt(params.shopDomain, {
        name: botSetting?.aiPersonaName,
        tone: botSetting?.aiTone,
        language: botSetting?.aiLanguage,
        customInstructions: botSetting?.aiSystemPrompt,
      }),
      messages,
      onChunk: (chunk) => {
        assistantText += chunk;
        params.onChunk(chunk);
      },
      signal: params.signal,
    });

    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: ChatMessageRole.assistant,
          content: assistantText,
        },
      }),
      this.prisma.chatThread.update({
        where: { id: thread.id },
        data: {
          lastMessage: preview(assistantText) || thread.lastMessage,
          updatedAt: new Date(),
        },
      }),
    ]);

    // 只有真的产出了内容才算一次 AI 回答——空回复不该扣额度。
    if (assistantText.trim()) {
      await this.quota.recordAnswer(params.shopDomain);
    }
  }
}

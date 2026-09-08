import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AdpService } from '../adp/adp.service';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class PublicStorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly adp: AdpService,
    private readonly conversations: ConversationService,
  ) {}

  async botSettingsByShop(shopDomain: string) {
    const shop = await this.tenants.getByShopDomain(shopDomain);
    if (!shop) throw new NotFoundException('shop not found');
    const setting =
      shop.botSetting ??
      (await this.prisma.botSetting.create({
        data: { shopId: shop.id, shopName: shop.shopDomain },
      }));
    const quickReplies = Array.isArray(setting.widgetQuickReplies)
      ? setting.widgetQuickReplies.filter((x): x is string => typeof x === 'string')
      : [];
    return {
      shopId: shop.shopDomain,
      shopName: setting.shopName,
      botId: setting.botId,
      chatLogo: setting.chatLogo,
      chatAvatar: setting.chatAvatar,
      widgetPrimaryColor: setting.widgetPrimaryColor ?? '#008060',
      widgetHeaderColor: setting.widgetHeaderColor ?? setting.widgetPrimaryColor ?? '#008060',
      widgetPosition: setting.widgetPosition ?? 'bottom-right',
      widgetWindowSize: setting.widgetWindowSize ?? 'medium',
      widgetLauncherStyle: setting.widgetLauncherStyle ?? 'chat',
      widgetVisible: setting.widgetVisible ?? true,
      widgetQuickReplies: quickReplies,
      welcomeMessage: setting.welcomeMessage,
    };
  }

  async widgetConfigByShop(shopDomain: string) {
    const base = await this.botSettingsByShop(shopDomain);
    return {
      shopDomain: base.shopId,
      shopName: base.shopName,
      widgetPrimaryColor: base.widgetPrimaryColor,
      widgetHeaderColor: base.widgetHeaderColor,
      widgetPosition: base.widgetPosition,
      widgetWindowSize: base.widgetWindowSize,
      widgetLauncherStyle: base.widgetLauncherStyle,
      widgetVisible: base.widgetVisible,
      widgetQuickReplies: base.widgetQuickReplies,
      welcomeMessage: base.welcomeMessage,
    };
  }

  async upsertInboxUser(shopDomain: string, userEmail: string, displayName?: string) {
    const shop = await this.tenants.ensureShopTenant(shopDomain);
    return this.prisma.inboxUser.upsert({
      where: { shopId_userEmail: { shopId: shop.id, userEmail } },
      create: { shopId: shop.id, userEmail, displayName },
      update: { displayName },
    });
  }

  /**
   * 顾客侧增量拉取。
   *
   * 商家的人工回复此前没有任何送达路径：顾客侧只有一条 SSE，而那条流在 AI
   * 回完就结束了。widget 打开时按游标轮询这里，才让「接管」真的闭环。
   *
   * 鉴权沿用 POST public/chat 的模型：(shopDomain, visitorId) 定位会话，
   * 不接受调用方指定 threadId——否则任何人都能翻别人的对话。
   */
  async messagesFor(shopDomain: string, visitorId: string, afterId?: string) {
    const thread = await this.prisma.chatThread.findUnique({
      where: { shopDomain_visitorId: { shopDomain, visitorId } },
      select: { id: true, status: true },
    });
    // 还没说过话的访客不是错误，是空会话。
    if (!thread) return { status: null, messages: [] };
    const messages = await this.conversations.messagesAfter(thread.id, afterId);
    return {
      status: thread.status,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  chat(params: {
    shopDomain: string;
    text: string;
    visitorId: string;
    conversationId?: string;
    onChunk: (c: string) => void;
    signal?: AbortSignal;
  }) {
    return this.adp.proxyChatSse({
      shopDomain: params.shopDomain,
      visitorId: params.visitorId,
      text: params.text,
      conversationId: params.conversationId,
      onChunk: params.onChunk,
      signal: params.signal,
    });
  }
}

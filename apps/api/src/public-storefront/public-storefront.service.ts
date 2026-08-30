import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AdpService } from '../adp/adp.service';

@Injectable()
export class PublicStorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly adp: AdpService,
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

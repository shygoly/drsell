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
    return {
      shopId: shop.shopDomain,
      shopName: setting.shopName,
      botId: setting.botId,
      chatLogo: setting.chatLogo,
      chatAvatar: setting.chatAvatar,
      widgetPrimaryColor: setting.widgetPrimaryColor ?? '#008060',
      widgetPosition: setting.widgetPosition ?? 'bottom-right',
      welcomeMessage: setting.welcomeMessage,
    };
  }

  async widgetConfigByShop(shopDomain: string) {
    const base = await this.botSettingsByShop(shopDomain);
    return {
      shopDomain: base.shopId,
      shopName: base.shopName,
      widgetPrimaryColor: base.widgetPrimaryColor,
      widgetPosition: base.widgetPosition,
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

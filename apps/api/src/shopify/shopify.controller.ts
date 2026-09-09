import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/auth.service';
import { Auth, CurrentUser } from '../common/auth.decorators';
import { ShopScopeService } from '../common/shop-scope.service';
import { ShopifyService } from './shopify.service';
import { BillingService } from '../subscription/billing.service';
import { PatchOnboardingDto } from './dto/onboarding.dto';

class ShopLoginDto {
  @IsString()
  shop!: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  scopes?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  accessTokenExpiresAt?: string;

  @IsOptional()
  @IsString()
  refreshTokenExpiresAt?: string;
}

class AppBridgeLoginDto {
  @IsString()
  sessionToken!: string;
}

class BotSettingDto {
  @IsOptional() @IsString() shopName?: string;
  @IsOptional() @IsString() botId?: string;
  @IsOptional() @IsString() chatLogo?: string;
  @IsOptional() @IsString() chatAvatar?: string;
  @IsOptional() @IsString() widgetPrimaryColor?: string;
  @IsOptional() @IsString() widgetHeaderColor?: string;
  @IsOptional() @IsString() widgetPosition?: string;
  @IsOptional() @IsString() widgetWindowSize?: string;
  @IsOptional() @IsString() widgetLauncherStyle?: string;
  @IsOptional() @IsBoolean() widgetVisible?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) widgetQuickReplies?: string[];
  @IsOptional() @IsString() welcomeMessage?: string;
}

@Controller('shopify')
export class ShopifyController {
  private readonly logger = new Logger(ShopifyController.name);

  constructor(
    private readonly shopify: ShopifyService,
    private readonly scope: ShopScopeService,
    private readonly billing: BillingService,
  ) {}

  /**
   * 仅供 OAuth callback 服务端调用（apps/web）。
   * 公开暴露等于「传任意 shop 域名即换发该店 JWT」，故强制内部密钥。
   */
  @Post('auth/login')
  login(
    @Headers('x-internal-key') internalKey: string | undefined,
    @Body() body: ShopLoginDto,
  ) {
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected || internalKey !== expected) {
      throw new UnauthorizedException('invalid internal key');
    }
    return this.shopify.login(body);
  }

  @Post('auth/app-bridge')
  appBridgeLogin(@Body() body: AppBridgeLoginDto) {
    return this.shopify.loginWithAppBridgeSessionToken(body.sessionToken);
  }

  /**
   * 立即回查并更新本店的订阅镜像。
   *
   * 商家在 Shopify 的套餐选择页选定套餐后会被重定向回应用（带 `plan_handle`），
   * 那是**唯一一个「刚刚发生了变化」的确定信号**——`app_subscriptions/update`
   * 自 2026-04-28 起已不再由 Shopify 发送（Shopify App Pricing 文档）。
   * 商家端在回跳落地时调这里，否则刚选完套餐仍会显示「没有有效套餐」；
   * 审核员遇到这一幕，审核当场失败。
   *
   * 不读回跳参数：`plan_handle` 只说明「变了」，档位与周期终点仍以 API 回查为准。
   */
  @Auth()
  @Post('subscription/sync')
  async syncSubscription(
    @CurrentUser() user: JwtPayload,
    @Query('shop') shop: string,
  ) {
    const domain = await this.scope.resolveShopDomain(user, shop);
    const sub = await this.billing.syncFromShopify(domain);
    return {
      ok: true,
      planCode: sub?.planCode ?? null,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  @Auth()
  @Get('botSettings/shop/:shopDomain')
  async getBot(
    @CurrentUser() user: JwtPayload,
    @Param('shopDomain') shopDomain: string,
  ) {
    return this.shopify.getOrCreateBotSetting(
      await this.scope.resolveShopDomain(user, shopDomain),
    );
  }

  @Auth()
  @Put('botSettings/shop/:shopDomain')
  async putBot(
    @CurrentUser() user: JwtPayload,
    @Param('shopDomain') shopDomain: string,
    @Body() body: BotSettingDto,
  ) {
    return this.shopify.updateBotSetting(
      await this.scope.resolveShopDomain(user, shopDomain),
      body,
    );
  }

  @Auth()
  @Post('sync/batch')
  async batchSync(
    @CurrentUser() user: JwtPayload,
    @Query('shop') shop?: string,
  ) {
    return this.shopify.startBatchSync(
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  @Auth()
  @Post('sync/:kind')
  async sync(
    @CurrentUser() user: JwtPayload,
    @Param('kind') kind: 'products' | 'orders' | 'customers',
    @Query('shop') shop?: string,
  ) {
    return this.shopify.syncCatalog(
      await this.scope.resolveShopDomain(user, shop),
      kind,
    );
  }

  @Auth()
  @Get('onboarding')
  async getOnboarding(
    @CurrentUser() user: JwtPayload,
    @Query('shop') shop?: string,
  ) {
    return this.shopify.getOnboardingState(
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  @Auth()
  @Patch('onboarding')
  async patchOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body() body: PatchOnboardingDto,
    @Query('shop') shop?: string,
  ) {
    return this.shopify.patchOnboardingState(
      await this.scope.resolveShopDomain(user, shop),
      body,
    );
  }

  @Auth()
  @Get('sync/status')
  async syncStatus(
    @CurrentUser() user: JwtPayload,
    @Query('shop') shop?: string,
  ) {
    return this.shopify.getSyncStatus(
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  @Auth()
  @Get('chat-stats/today')
  async today(@CurrentUser() user: JwtPayload, @Query('shop') shop?: string) {
    return this.shopify.todayChatStats(
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  @Auth()
  @Get('products')
  async products(
    @CurrentUser() user: JwtPayload,
    @Query('tenantId') tenantId?: string,
    @Query('take') take?: string,
  ) {
    return this.shopify.listProducts(
      await this.scope.resolveTenantId(user, tenantId),
      take ? Number(take) : 50,
    );
  }

  @Auth()
  @Get('orders')
  async orders(
    @CurrentUser() user: JwtPayload,
    @Query('tenantId') tenantId?: string,
    @Query('customerId') customerId?: string,
    @Query('take') take?: string,
  ) {
    return this.shopify.listOrders(
      await this.scope.resolveTenantId(user, tenantId),
      customerId,
      take ? Number(take) : 50,
    );
  }

  @Post('webhooks')
  async webhooks(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-shopify-hmac-sha256') hmac?: string,
    @Headers('x-shopify-topic') topic?: string,
    @Headers('x-shopify-shop-domain') shop?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const hmacCheck = this.shopify.verifyWebhook(raw, hmac);
    if (hmacCheck.matched === 'previous') {
      // 轮换窗口还没过去：Shopify 仍在用旧密钥签。收下，但必须吵——
      // 一旦 Shopify 切到新密钥，SHOPIFY_API_SECRET_PREVIOUS 就该删掉，
      // 留着等于长期接受一把本该作废的密钥。
      this.logger.warn(
        `webhook accepted with PREVIOUS secret: topic=${topic ?? '-'} shop=${shop ?? '-'} ` +
          `——Shopify 仍在用旧密钥签名，确认切换完成后请删除 SHOPIFY_API_SECRET_PREVIOUS`,
      );
    }
    if (hmacCheck.ok) {
      // 记账在处理之前，且不 await 失败：判据要留痕，但不能影响 webhook 的 2xx。
      void this.shopify.recordWebhookSecretUse(
        hmacCheck.matched === 'previous' ? 'previous' : 'current',
        topic ?? '-',
      );
    }
    if (!hmacCheck.ok) {
      // 验签失败必须留下「是谁、什么主题」——2026-09-09 生产上 12 次真实 webhook
      // 全部 401，而用本地密钥自签三条路径全过，光看 nginx 日志分不出是密钥错
      // 还是这些 webhook 根本属于另一个 app。只记非敏感元信息，不记 body 与签名。
      this.logger.warn(
        `webhook hmac rejected: topic=${topic ?? '-'} shop=${shop ?? '-'} ` +
          `rawBody=${req.rawBody ? 'yes' : 'MISSING'} bytes=${raw.length} ` +
          `hmacLen=${hmac?.length ?? 0}`,
      );
      throw new UnauthorizedException('invalid webhook hmac');
    }
    if (topic === 'app/uninstalled' && shop) {
      return this.shopify.handleUninstall(shop);
    }
    // 托管计费（App Pricing）下商家在 Shopify 界面选套餐，不经过本服务的 createCharge。
    // 这是我们唯一能知道「他选了哪一档」的途径——不接就会把付 $30 的 Pro 商家
    // 按 basic 的 1500 次额度掐掉。webhook 必须 2xx，失败只记日志不抛错。
    if (topic === 'app_subscriptions/update' && shop) {
      try {
        await this.billing.syncFromShopify(shop);
      } catch (e) {
        this.logger.error(`app_subscriptions/update sync failed for ${shop}: ${String(e)}`);
      }
      return { ok: true, topic };
    }
    // Shopify 强制合规 webhook：HMAC 已通过，处理必须幂等且永不抛错（合规端点须 2xx）。
    if (
      topic === 'customers/data_request' ||
      topic === 'customers/redact' ||
      topic === 'shop/redact'
    ) {
      return this.shopify.handleComplianceEvent(topic, shop || 'unknown', req.body ?? raw);
    }
    return { ok: true, topic };
  }
}

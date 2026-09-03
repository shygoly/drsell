import {
  Body,
  Controller,
  Get,
  Headers,
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
  constructor(
    private readonly shopify: ShopifyService,
    private readonly scope: ShopScopeService,
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
    if (!this.shopify.verifyWebhook(raw, hmac)) {
      throw new UnauthorizedException('invalid webhook hmac');
    }
    if (topic === 'app/uninstalled' && shop) {
      return this.shopify.handleUninstall(shop);
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

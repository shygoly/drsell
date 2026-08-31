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
import { Auth } from '../common/auth.decorators';
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
  constructor(private readonly shopify: ShopifyService) {}

  @Post('auth/login')
  login(@Body() body: ShopLoginDto) {
    return this.shopify.login(body);
  }

  @Post('auth/app-bridge')
  appBridgeLogin(@Body() body: AppBridgeLoginDto) {
    return this.shopify.loginWithAppBridgeSessionToken(body.sessionToken);
  }

  @Auth()
  @Get('botSettings/shop/:shopDomain')
  getBot(@Param('shopDomain') shopDomain: string) {
    return this.shopify.getOrCreateBotSetting(shopDomain);
  }

  @Auth()
  @Put('botSettings/shop/:shopDomain')
  putBot(@Param('shopDomain') shopDomain: string, @Body() body: BotSettingDto) {
    return this.shopify.updateBotSetting(shopDomain, body);
  }

  @Auth()
  @Post('sync/batch')
  batchSync(@Query('shop') shop: string) {
    return this.shopify.startBatchSync(shop);
  }

  @Auth()
  @Post('sync/:kind')
  sync(
    @Param('kind') kind: 'products' | 'orders' | 'customers',
    @Query('shop') shop: string,
  ) {
    return this.shopify.syncCatalog(shop, kind);
  }

  @Auth()
  @Get('onboarding')
  getOnboarding(@Query('shop') shop: string) {
    return this.shopify.getOnboardingState(shop);
  }

  @Auth()
  @Patch('onboarding')
  patchOnboarding(@Query('shop') shop: string, @Body() body: PatchOnboardingDto) {
    return this.shopify.patchOnboardingState(shop, body);
  }

  @Auth()
  @Get('sync/status')
  syncStatus(@Query('shop') shop: string) {
    return this.shopify.getSyncStatus(shop);
  }

  @Auth()
  @Get('chat-stats/today')
  today(@Query('shop') shop: string) {
    return this.shopify.todayChatStats(shop);
  }

  @Auth()
  @Get('products')
  products(@Query('tenantId') tenantId: string, @Query('take') take?: string) {
    return this.shopify.listProducts(tenantId, take ? Number(take) : 50);
  }

  @Auth()
  @Get('orders')
  orders(
    @Query('tenantId') tenantId: string,
    @Query('customerId') customerId?: string,
    @Query('take') take?: string,
  ) {
    return this.shopify.listOrders(tenantId, customerId, take ? Number(take) : 50);
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
    return { ok: true, topic };
  }
}

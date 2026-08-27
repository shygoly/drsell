import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { PublicStorefrontService } from './public-storefront.service';

class InboxDto {
  @IsString()
  shopDomain!: string;

  @IsEmail()
  userEmail!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

class PublicChatDto {
  @IsString()
  shopDomain!: string;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsString()
  visitorId!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

@Controller()
export class PublicStorefrontController {
  constructor(private readonly storefront: PublicStorefrontService) {}

  @Get('botSettings/shop/:shopDomain')
  botSettings(@Param('shopDomain') shopDomain: string) {
    return this.storefront.botSettingsByShop(shopDomain);
  }

  @Get('public/widget-config')
  widgetConfig(@Query('shop') shop: string) {
    return this.storefront.widgetConfigByShop(shop);
  }

  @Post('inboxUser')
  inbox(@Body() body: InboxDto) {
    return this.storefront.upsertInboxUser(body.shopDomain, body.userEmail, body.displayName);
  }

  @Post('public/chat')
  async chat(@Body() body: PublicChatDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    try {
      await this.storefront.chat({
        shopDomain: body.shopDomain,
        text: body.text,
        visitorId: body.visitorId,
        conversationId: body.conversationId,
        onChunk: (c) => res.write(c),
      });
      res.end();
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: String(e) })}\n\n`);
      res.end();
    }
  }
}

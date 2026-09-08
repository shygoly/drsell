import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { JwtPayload } from '../auth/auth.service';
import { Auth, CurrentUser } from '../common/auth.decorators';
import { ShopScopeService } from '../common/shop-scope.service';
import { StorefrontDashboardService } from './storefront-dashboard.service';
import { QuotaService } from '../quota/quota.service';

class ReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

/**
 * 商家仪表盘接口。
 * 全局前缀 api → 实际路径 /api/storefront/*
 * 前端消费方：apps/storefront（Next.js）。
 *
 * 店铺范围一律由会话 token 决定，query 里的 shop 只用于比对（见 shop-scope.ts）。
 *
 * 写路由（takeover / reply / close）是本控制器第一次出现非 @Get handler。
 * 它们不走 @Audit：INV-3 守的是运营台改「别人家」的订阅与计费，
 * 商家在自己店里接管自己的会话，操作者与数据主体同一，不在那条不变量的射程内。
 */
@Controller('storefront')
export class StorefrontDashboardController {
  constructor(
    private readonly dashboard: StorefrontDashboardService,
    private readonly scope: ShopScopeService,
    private readonly quota: QuotaService,
  ) {}

  /**
   * 本周期 AI 回答用量。商家要能在用尽之前看到进度——用尽当下才发现，
   * 顾客那边已经收到「暂时无法回答」了。
   */
  @Auth()
  @Get('quota')
  async quotaUsage(@CurrentUser() user: JwtPayload, @Query('shop') shop?: string) {
    return this.quota.usage(await this.scope.resolveShopDomain(user, shop));
  }

  @Auth()
  @Get('stats')
  async stats(@CurrentUser() user: JwtPayload, @Query('shop') shop?: string) {
    return this.dashboard.getStats(
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  @Auth()
  @Get('chart')
  async chart(@CurrentUser() user: JwtPayload, @Query('shop') shop?: string) {
    return this.dashboard.getChart(
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  @Auth()
  @Get('conversations')
  async conversations(
    @CurrentUser() user: JwtPayload,
    @Query('shop') shop?: string,
  ) {
    return this.dashboard.getConversations(
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  @Auth()
  @Get('suggestion')
  async suggestion(
    @CurrentUser() user: JwtPayload,
    @Query('shop') shop?: string,
  ) {
    return this.dashboard.getSuggestion(
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  @Auth()
  @Get('inbox/:threadId/messages')
  async threadMessages(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
    @Query('shop') shop?: string,
  ) {
    return this.dashboard.getThreadMessages(
      threadId,
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  /**
   * 人工接管。以前这个动作只改前端 React state——刷新页面就没了，
   * 而 status='human' 从未被后端写入过，指标据此计算，于是恒为零。
   */
  @Auth()
  @Post('inbox/:threadId/takeover')
  @HttpCode(200)
  async takeOver(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
    @Query('shop') shop?: string,
  ) {
    return this.dashboard.takeOver(
      threadId,
      await this.scope.resolveShopDomain(user, shop),
    );
  }

  /**
   * 商家回复顾客。配额耗尽时我们已经对顾客说了「the store team will follow up」，
   * 在此之前那句话没有任何兑现路径。
   */
  @Auth()
  @Post('inbox/:threadId/reply')
  @HttpCode(200)
  async reply(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
    @Body() body: ReplyDto,
    @Query('shop') shop?: string,
  ) {
    return this.dashboard.reply(
      threadId,
      await this.scope.resolveShopDomain(user, shop),
      body.text,
    );
  }

  @Auth()
  @Post('inbox/:threadId/close')
  @HttpCode(200)
  async close(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
    @Query('shop') shop?: string,
  ) {
    return this.dashboard.close(
      threadId,
      await this.scope.resolveShopDomain(user, shop),
    );
  }
}

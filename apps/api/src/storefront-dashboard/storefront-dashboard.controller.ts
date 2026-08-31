import { Controller, Get, Param, Query } from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.service';
import { Auth, CurrentUser } from '../common/auth.decorators';
import { ShopScopeService } from '../common/shop-scope.service';
import { StorefrontDashboardService } from './storefront-dashboard.service';

/**
 * 商家仪表盘只读接口。
 * 全局前缀 api → 实际路径 /api/storefront/*
 * 前端消费方：apps/storefront（Next.js）。
 *
 * 店铺范围一律由会话 token 决定，query 里的 shop 只用于比对（见 shop-scope.ts）。
 */
@Controller('storefront')
export class StorefrontDashboardController {
  constructor(
    private readonly dashboard: StorefrontDashboardService,
    private readonly scope: ShopScopeService,
  ) {}

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
}

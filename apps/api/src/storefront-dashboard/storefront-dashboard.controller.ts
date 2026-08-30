import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorefrontDashboardService } from './storefront-dashboard.service';

/**
 * 商家仪表盘只读接口（Stitch 试点）。
 * 全局前缀 api → 实际路径 /api/storefront/*
 * 前端消费方：apps/storefront（Next.js）。
 */
@Controller('storefront')
export class StorefrontDashboardController {
  constructor(private readonly dashboard: StorefrontDashboardService) {}

  @Get('stats')
  stats(@Query('shop') shop?: string) {
    return this.dashboard.getStats(shop);
  }

  @Get('chart')
  chart(@Query('shop') shop?: string) {
    return this.dashboard.getChart(shop);
  }

  @Get('conversations')
  conversations(@Query('shop') shop?: string) {
    return this.dashboard.getConversations(shop);
  }

  @Get('suggestion')
  suggestion(@Query('shop') shop?: string) {
    return this.dashboard.getSuggestion(shop);
  }

  @Get('inbox/:threadId/messages')
  threadMessages(@Param('threadId') threadId: string, @Query('shop') shop?: string) {
    return this.dashboard.getThreadMessages(threadId, shop);
  }
}

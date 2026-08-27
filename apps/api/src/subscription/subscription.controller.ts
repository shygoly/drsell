import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Auth } from '../common/auth.decorators';
import { SubscriptionService } from './subscription.service';

class FreeSubDto {
  @IsString()
  shopDomain!: string;

  @IsOptional()
  @IsString()
  planCode?: string;
}

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subs: SubscriptionService) {}

  @Auth()
  @Post('addFree')
  addFree(@Body() body: FreeSubDto) {
    return this.subs.addFree(body.shopDomain, body.planCode);
  }

  @Auth()
  @Post('cancel/:id')
  cancel(@Param('id') id: string) {
    return this.subs.cancel(id);
  }

  @Auth()
  @Get()
  list(@Query('shop') shop: string) {
    return this.subs.list(shop);
  }
}

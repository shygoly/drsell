import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CurrentUser } from '../common/auth.decorators';
import type { JwtPayload } from '../auth/auth.service';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';
import { OpsSuperadminGuard } from './ops-superadmin.guard';
import { OpsService } from './ops.service';

class ExtendFreezeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;
}

class BillingShopDto {
  @IsOptional()
  @IsString()
  targetDomain?: string;
}

@Controller('ops')
@UseGuards(AuthGuard('jwt'), OpsSuperadminGuard)
@UseInterceptors(AuditInterceptor)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.ops.me(user.email ?? 'unknown');
  }

  @Get('plans')
  plans() {
    return this.ops.listPlans();
  }

  @Get('queue')
  queue() {
    return this.ops.expiryQueue();
  }

  @Get('accounts')
  accounts(@Query('q') q = '') {
    return this.ops.searchAccounts(q);
  }

  @Get('accounts/by-shop/:domain')
  accountByShop(@Param('domain') domain: string) {
    return this.ops.findAccountByShopDomain(domain);
  }

  @Get('accounts/:id')
  account(@Param('id') id: string) {
    return this.ops.getAccount(id);
  }

  @Get('shops')
  shops() {
    return this.ops.listShops();
  }

  @Get('shops/:domain')
  shop(@Param('domain') domain: string) {
    return this.ops.getShop(domain);
  }

  @Get('audit-logs')
  auditLogs(
    @Query('q') q = '',
    @Query('action') action = '',
    @Query('actor') actor = '',
    @Query('from') from = '',
    @Query('to') to = '',
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const n = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    return this.ops.listAuditLogs({
      q,
      action,
      actor,
      from: from || undefined,
      to: to || undefined,
      limit: n,
      offset: off,
    });
  }

  @Audit('shop.dunning')
  @Post('shops/:domain/dunning')
  dunning(@Param('domain') domain: string) {
    return this.ops.sendDunning(domain);
  }

  @Audit('shop.extend_freeze')
  @Post('shops/:domain/extend-freeze')
  extendFreeze(@Param('domain') domain: string, @Body() body: ExtendFreezeDto) {
    return this.ops.extendFreeze(domain, body.days ?? 7);
  }

  @Audit('shop.billing_shop')
  @Post('shops/:domain/billing-shop')
  billingShop(@Param('domain') domain: string, @Body() body: BillingShopDto) {
    return this.ops.setBillingShop(domain, body.targetDomain);
  }

  @Audit('shop.resync')
  @Post('shops/:domain/resync')
  resync(@Param('domain') domain: string) {
    return this.ops.resync(domain);
  }

  @Audit('shop.impersonate')
  @Post('shops/:domain/impersonate')
  impersonate(@Param('domain') domain: string, @CurrentUser() user: JwtPayload) {
    return this.ops.impersonate(domain, user.email ?? 'unknown');
  }

  @Audit('shop.disable_widget')
  @Post('shops/:domain/disable-widget')
  disableWidget(@Param('domain') domain: string) {
    return this.ops.disableWidget(domain);
  }

  @Audit('shop.enable_widget')
  @Post('shops/:domain/enable-widget')
  enableWidget(@Param('domain') domain: string) {
    return this.ops.enableWidget(domain);
  }
}

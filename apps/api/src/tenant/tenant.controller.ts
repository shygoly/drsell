import { Controller, Get, Param } from '@nestjs/common';
import { Auth, CurrentUser } from '../common/auth.decorators';
import { TenantService } from './tenant.service';
import type { JwtPayload } from '../auth/auth.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  @Auth()
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return { tenantId: user.tenantId, shop: user.shop, typ: user.typ };
  }

  @Auth()
  @Get('shop/:shopDomain')
  byShop(@Param('shopDomain') shopDomain: string) {
    return this.tenants.getByShopDomain(shopDomain);
  }
}

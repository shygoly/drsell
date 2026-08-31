import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { Auth, CurrentUser } from '../common/auth.decorators';
import { MembershipService } from './membership.service';
import { AuthService, type JwtPayload } from '../auth/auth.service';
import { TenantService } from '../tenant/tenant.service';
import { BillingService } from '../subscription/billing.service';

class GrantDto {
  @IsString()
  userToken!: string;

  @IsString()
  shopDomain!: string;

  @IsOptional()
  @IsString()
  role?: string;
}

class ClaimDto {
  @IsString()
  shopToken!: string;
}

class SwitchDto {
  @IsString()
  shopDomain!: string;
}

@Controller('membership')
export class MembershipController {
  constructor(
    private readonly membership: MembershipService,
    private readonly tenants: TenantService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly billing: BillingService,
  ) {}

  /**
   * OAuth 回调在换发 shop JWT 后调用（内部密钥），把安装归属到发起账号。
   * userToken 是登录态下发起安装的 admin JWT，由本服务验签后取 sub。
   */
  @Post('grant')
  async grant(
    @Headers('x-internal-key') key: string | undefined,
    @Body() body: GrantDto,
  ) {
    const expected = process.env.INTERNAL_API_KEY;
    if (expected && key !== expected) {
      throw new UnauthorizedException('invalid internal key');
    }
    const payload = (await this.jwt.verifyAsync(body.userToken)) as JwtPayload;
    if (payload.typ !== 'admin' || !payload.sub) {
      throw new UnauthorizedException('not an admin session');
    }
    const shop = await this.tenants.getByShopDomain(body.shopDomain);
    if (!shop) throw new NotFoundException('shop not found');
    await this.membership.grant(payload.sub, shop.id, body.role ?? 'owner');
    return { ok: true };
  }

  /**
   * App Store 直装后认领：同时持有用户 admin JWT（Authorization）与该店的
   * shop JWT（body），且店铺尚无 owner 时才建立归属。
   */
  @Auth()
  @Post('claim')
  async claim(@CurrentUser() user: JwtPayload, @Body() body: ClaimDto) {
    if (user.typ !== 'admin') {
      throw new UnauthorizedException('user session required');
    }
    const shopPayload = (await this.jwt.verifyAsync(body.shopToken)) as JwtPayload;
    if (shopPayload.typ !== 'shop' || !shopPayload.sub) {
      throw new UnauthorizedException('invalid shop token');
    }
    const shop = await this.tenants.getById(shopPayload.sub);
    if (!shop) throw new NotFoundException('shop not found');

    const owner = await this.membership.ownerOf(shop.id);
    if (owner && owner.userId !== user.sub) {
      throw new ConflictException('shop already claimed by another account');
    }
    await this.membership.grant(user.sub, shop.id, 'owner');
    return { ok: true };
  }

  @Auth()
  @Get('shops')
  shops(@CurrentUser() user: JwtPayload) {
    if (user.typ !== 'admin') {
      throw new UnauthorizedException('user session required');
    }
    return this.membership.listShops(user.sub);
  }

  /** 切店：用用户 token 换发目标店铺的 shop JWT */
  @Auth()
  @Post('switch')
  async switchShop(@CurrentUser() user: JwtPayload, @Body() body: SwitchDto) {
    if (user.typ !== 'admin') {
      throw new UnauthorizedException('user session required');
    }
    const shop = await this.membership.assertMember(user.sub, body.shopDomain);
    return this.auth.signShopSession({
      shop: shop.shopDomain,
      tenantId: shop.tenantId,
      shopRecordId: shop.id,
    });
  }

  /** 当前账号各店的计费状态（只读） */
  @Auth()
  @Get('billing')
  async billingStatus(@CurrentUser() user: JwtPayload) {
    if (user.typ !== 'admin') {
      throw new UnauthorizedException('user session required');
    }
    const rows = await this.membership.listShops(user.sub);
    const shopIds = rows.map((r) => r.shop.id);
    const subs = await this.billing.statusForShops(shopIds);
    return rows.map((r) => ({
      shop: r.shop,
      role: r.role,
      subscription:
        subs.find((s) => s.shopId === r.shop.id) ?? null,
    }));
  }

  /** 指定组内计费店（收全额的店） */
  @Auth()
  @Post('billing/set')
  async setBillingShop(
    @CurrentUser() user: JwtPayload,
    @Body() body: SwitchDto,
  ) {
    if (user.typ !== 'admin') {
      throw new UnauthorizedException('user session required');
    }
    await this.membership.assertMember(user.sub, body.shopDomain);
    return this.billing.setBillingShop(body.shopDomain);
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipService } from '../membership/membership.service';
import type { JwtPayload } from '../auth/auth.service';
import { normalizeShopDomain } from './shop-scope';

/**
 * 请求作用域内唯一的店铺来源（异步版）。
 *
 * - shop 会话：只认 token 里绑定的那家店，是嵌入端的快路径，不查库。
 * - admin 会话：通过 Membership 校验「该用户是否有这家店」；
 *   superadmin 例外，可显式指定任意店铺。
 */
@Injectable()
export class ShopScopeService {
  constructor(
    private readonly membership: MembershipService,
    private readonly prisma: PrismaService,
  ) {}

  async resolveShopDomain(
    user: JwtPayload | undefined,
    requested?: string,
  ): Promise<string> {
    const asked = normalizeShopDomain(requested);

    if (user?.typ === 'shop') {
      const bound = normalizeShopDomain(user.shop);
      if (!bound) throw new ForbiddenException('session has no shop scope');
      if (asked && asked !== bound) {
        throw new ForbiddenException('shop out of session scope');
      }
      return bound;
    }

    if (user?.typ === 'admin' && user.role === 'superadmin') {
      if (!asked) throw new ForbiddenException('shop is required');
      return asked;
    }

    if (user?.typ === 'admin') {
      if (!asked) throw new ForbiddenException('shop is required');
      await this.membership.assertMember(user.sub, asked);
      return asked;
    }

    throw new ForbiddenException('session is not bound to a shop');
  }

  async resolveTenantId(
    user: JwtPayload | undefined,
    requested?: string,
  ): Promise<string> {
    const asked = (requested ?? '').trim();

    if (user?.typ === 'admin' && user.role === 'superadmin') {
      if (!asked) throw new ForbiddenException('tenantId is required');
      return asked;
    }

    if (user?.typ === 'admin') {
      if (!asked) throw new ForbiddenException('tenantId is required');
      const m = await this.prisma.membership.findFirst({
        where: { userId: user.sub, shop: { tenantId: asked } },
        select: { id: true },
      });
      if (!m) throw new ForbiddenException('tenant out of session scope');
      return asked;
    }

    const bound = user?.tenantId;
    if (!bound) throw new ForbiddenException('session is not bound to a tenant');
    if (asked && asked !== bound) {
      throw new ForbiddenException('tenant out of session scope');
    }
    return bound;
  }
}

import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeShopDomain } from '../common/shop-scope';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** 安装/邀请时建立归属，幂等 */
  grant(userId: string, shopId: string, role = 'owner') {
    return this.prisma.membership.upsert({
      where: { userId_shopId: { userId, shopId } },
      create: { userId, shopId, role },
      update: { role },
    });
  }

  listShops(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: {
        shop: {
          select: {
            id: true,
            shopDomain: true,
            tenantId: true,
            uninstalledAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 校验用户对某店有权限，返回 shop 记录；否则 403 */
  async assertMember(userId: string, shopDomain: string) {
    const m = await this.prisma.membership.findFirst({
      where: {
        userId,
        shop: { shopDomain: normalizeShopDomain(shopDomain) },
      },
      include: { shop: true },
    });
    if (!m) {
      throw new ForbiddenException('shop not in your account');
    }
    return m.shop;
  }

  /** 该店的 owner membership（用于认领防重） */
  ownerOf(shopId: string) {
    return this.prisma.membership.findFirst({
      where: { shopId, role: 'owner' },
    });
  }
}

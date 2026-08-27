import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  dashboard() {
    return Promise.all([
      this.prisma.shop.count(),
      this.prisma.tenant.count(),
      this.prisma.inboxUser.count(),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.mailSubscriber.count({ where: { status: 'active' } }),
    ]).then(([shops, tenants, inboxUsers, activeSubs, mailSubs]) => ({
      shops,
      tenants,
      inboxUsers,
      activeSubs,
      mailSubs,
    }));
  }

  listShops() {
    return this.prisma.shop.findMany({
      include: { botSetting: true, tenant: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listUsers() {
    return this.prisma.adminUser.findMany({
      select: { id: true, email: true, role: true, tenantId: true, createdAt: true },
    });
  }
}

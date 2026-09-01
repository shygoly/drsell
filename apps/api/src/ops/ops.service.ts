import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyService } from '../shopify/shopify.service';
import { BillingService } from '../subscription/billing.service';
import { SubscriptionMirrorService } from './subscription-mirror.service';
import { buildAuditWhere } from './ops-audit.util';
import { listOpsPlans, resolveOpsPlan } from './ops-plan.config';

const TERMINAL = new Set(['DECLINED', 'EXPIRED', 'CANCELLED']);

export type QueueItem = {
  shopDomain: string;
  status: string;
  ownerEmail: string | null;
  daysRemaining: number;
  queueKind: 'trial' | 'period' | 'unfreeze';
  windowStart: string;
  windowEnd: string;
};

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mirror: SubscriptionMirrorService,
    private readonly billing: BillingService,
    private readonly shopify: ShopifyService,
    private readonly jwt: JwtService,
  ) {}

  async searchAccounts(prefix: string) {
    const q = prefix.trim().toLowerCase();
    if (!q) return [];
    return this.prisma.adminUser.findMany({
      where: { email: { startsWith: q } },
      select: { id: true, email: true, role: true },
      take: 50,
      orderBy: { email: 'asc' },
    });
  }

  async findAccountByShopDomain(shopDomain: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopDomain },
      include: {
        memberships: { include: { user: true } },
      },
    });
    if (!shop) throw new NotFoundException('shop not found');
    const users = shop.memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      role: m.role,
    }));
    if (!users.length) {
      const tenantUsers = await this.prisma.adminUser.findMany({
        where: { tenantId: shop.tenantId },
        select: { id: true, email: true, role: true },
      });
      return { shopDomain, accounts: tenantUsers };
    }
    return { shopDomain, accounts: users };
  }

  async getAccount(id: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            shop: {
              include: { subscriptions: true },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('account not found');

    const shopsFromMembership = await Promise.all(
      user.memberships.map(async (m) => ({
        shopDomain: m.shop.shopDomain,
        role: m.role,
        status: m.shop.subscriptions[0]?.status ?? 'UNKNOWN',
        isBillingShop: m.shop.subscriptions.some((s) => s.isBillingShop),
        installedAt: m.shop.installedAt.toISOString(),
      })),
    );

    if (shopsFromMembership.length) {
      const shopDomains = shopsFromMembership.map((s) => s.shopDomain);
      const auditPreview = await this.auditPreviewForShops(shopDomains);
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        authProvider: 'email',
        lastLoginAt: user.updatedAt.toISOString(),
        totalShops: shopsFromMembership.length,
        totalMonthlyBillUsd: this.sumBillingUsd(user.memberships.map((m) => ({
          isBillingShop: m.shop.subscriptions.some((sub) => sub.isBillingShop),
          planCode: m.shop.subscriptions[0]?.planCode,
        }))),
        shops: shopsFromMembership,
        auditPreview,
      };
    }

    const tenantShops = user.tenantId
      ? await this.prisma.shop.findMany({
          where: { tenantId: user.tenantId },
          include: { subscriptions: true },
        })
      : [];

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      authProvider: 'email',
      lastLoginAt: user.updatedAt.toISOString(),
      totalShops: tenantShops.length,
      totalMonthlyBillUsd: this.sumBillingUsd(tenantShops.map((s) => ({
        isBillingShop: s.subscriptions.some((sub) => sub.isBillingShop),
        planCode: s.subscriptions[0]?.planCode,
      }))),
      shops: tenantShops.map((s) => ({
        shopDomain: s.shopDomain,
        role: 'tenant',
        status: s.subscriptions[0]?.status ?? 'UNKNOWN',
        isBillingShop: s.subscriptions.some((sub) => sub.isBillingShop),
        installedAt: s.installedAt.toISOString(),
      })),
      auditPreview: await this.auditPreviewForShops(tenantShops.map((s) => s.shopDomain)),
    };
  }

  private sumBillingUsd(
    shops: Array<{ isBillingShop: boolean; planCode?: string | null }>,
  ): number {
    return shops.reduce((sum, s) => {
      if (!s.isBillingShop) return sum;
      return sum + resolveOpsPlan(s.planCode).priceUsd;
    }, 0);
  }

  private async auditPreviewForShops(shopDomains: string[]) {
    if (!shopDomains.length) return [];
    const items = await this.prisma.auditLog.findMany({
      where: buildAuditWhere({ shopDomains, limit: 4 }),
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    return items.map((row) => ({
      id: row.id,
      actorEmail: row.actorEmail,
      action: row.action,
      shopDomain: row.shopDomain,
      result: row.result,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  listPlans() {
    return listOpsPlans();
  }

  me(email: string) {
    return { email };
  }

  async listShops() {
    const shops = await this.prisma.shop.findMany({
      include: { subscriptions: true },
      orderBy: { shopDomain: 'asc' },
    });
    return shops.map((s) => {
      const sub = s.subscriptions[0];
      return {
        shopDomain: s.shopDomain,
        status: sub?.status ?? 'PENDING',
        trialEnds: sub?.trialEnds ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        unfreezeBy: sub?.unfreezeBy ?? null,
      };
    });
  }

  async getShop(shopDomain: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopDomain },
      include: {
        subscriptions: true,
        botSetting: true,
        memberships: { include: { user: true }, take: 1 },
      },
    });
    if (!shop) throw new NotFoundException('shop not found');
    const sub = shop.subscriptions[0];
    const plan = resolveOpsPlan(sub?.planCode);
    const periodStart = this.periodStart(sub);
    const statsWhere: { shopDomain: string; day?: { gte: Date } } = { shopDomain };
    if (periodStart) statsWhere.day = { gte: periodStart };
    const stats = await this.prisma.chatStatDaily.aggregate({
      where: statsWhere,
      _sum: { count: true, aiResolvedCount: true },
    });
    const agentSeatsUsed = await this.prisma.membership.count({ where: { shopId: shop.id } });
    const owner = shop.memberships[0]?.user;
    let accountShopCount: number | null = null;
    if (owner) {
      accountShopCount = await this.prisma.membership.count({
        where: { userId: owner.id },
      });
    }
    const chatUsed = stats._sum.count ?? 0;
    const aiResolvedUsed = stats._sum.aiResolvedCount ?? 0;
    const overAi = Math.max(0, aiResolvedUsed - plan.aiResolvedLimit);
    return {
      shopDomain: shop.shopDomain,
      status: sub?.status ?? 'PENDING',
      trialEnds: sub?.trialEnds?.toISOString() ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      unfreezeBy: sub?.unfreezeBy?.toISOString() ?? null,
      frozenAt: sub?.frozenAt?.toISOString() ?? null,
      isBillingShop: sub?.isBillingShop ?? false,
      widgetVisible: shop.botSetting?.widgetVisible ?? true,
      chatCount: chatUsed,
      chatLimit: plan.chatLimit,
      aiResolved: aiResolvedUsed,
      aiResolvedLimit: plan.aiResolvedLimit,
      agentSeats: Math.max(agentSeatsUsed, sub?.seats ?? 1),
      agentSeatsLimit: plan.seatLimit,
      overQuotaNote:
        overAi > 0
          ? `超出 ${overAi} 次 AI 解决，按 $${plan.aiOverageUsd} 计约 $${(overAi * plan.aiOverageUsd).toFixed(2)}，欠费解决前不出账。`
          : null,
      ownerEmail: owner?.email ?? null,
      accountShopCount,
      installedAt: shop.installedAt.toISOString(),
      planCode: plan.code,
      planName: plan.displayName,
      planPriceUsd: plan.priceUsd,
      shopifyChargeId: sub?.shopifyChargeId ?? null,
      lastSuccessfulChargeAt:
        sub?.status === 'ACTIVE' && sub.updatedAt ? sub.updatedAt.toISOString() : null,
      periodStart: periodStart?.toISOString() ?? null,
    };
  }

  private periodStart(sub: {
    trialEnds: Date | null;
    currentPeriodEnd: Date | null;
    frozenAt: Date | null;
    status: string;
  } | undefined): Date | null {
    if (!sub) return null;
    if (sub.currentPeriodEnd) {
      return new Date(sub.currentPeriodEnd.getTime() - 30 * 86400000);
    }
    if (sub.trialEnds) {
      return new Date(sub.trialEnds.getTime() - 14 * 86400000);
    }
    if (sub.frozenAt) return sub.frozenAt;
    return null;
  }

  async listAuditLogs(filters: {
    q?: string;
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const where = buildAuditWhere(filters);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((row) => ({
        id: row.id,
        actorEmail: row.actorEmail,
        action: row.action,
        shopDomain: row.shopDomain,
        result: row.result,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    };
  }

  async expiryQueue(now = new Date()): Promise<QueueItem[]> {
    const shops = await this.prisma.shop.findMany({
      include: {
        subscriptions: true,
        memberships: { include: { user: true }, take: 1 },
      },
    });
    const items: QueueItem[] = [];

    for (const shop of shops) {
      const sub = shop.subscriptions[0];
      if (!sub) continue;
      const status = sub.status.toUpperCase();
      if (TERMINAL.has(status)) continue;

      const trialEnd = sub.trialEnds;
      const periodEnd = sub.currentPeriodEnd;
      const unfreezeBy = sub.unfreezeBy;

      const ownerEmail = shop.memberships?.[0]?.user.email ?? null;

      if (trialEnd) {
        const days = Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000);
        if (days <= 3 && days >= 0) {
          items.push({
            shopDomain: shop.shopDomain,
            status,
            ownerEmail,
            daysRemaining: days,
            queueKind: 'trial',
            windowStart: new Date(trialEnd.getTime() - 14 * 86400000).toISOString(),
            windowEnd: trialEnd.toISOString(),
          });
          continue;
        }
      }

      if (status === 'FROZEN' && unfreezeBy) {
        const days = Math.ceil((unfreezeBy.getTime() - now.getTime()) / 86400000);
        if (days >= 0) {
          items.push({
            shopDomain: shop.shopDomain,
            status,
            ownerEmail,
            daysRemaining: days,
            queueKind: 'unfreeze',
            windowStart: (sub.frozenAt ?? now).toISOString(),
            windowEnd: unfreezeBy.toISOString(),
          });
          continue;
        }
      }

      if (periodEnd) {
        const days = Math.ceil((periodEnd.getTime() - now.getTime()) / 86400000);
        if (days <= 7 && days >= 0) {
          items.push({
            shopDomain: shop.shopDomain,
            status,
            ownerEmail,
            daysRemaining: days,
            queueKind: 'period',
            windowStart: new Date(periodEnd.getTime() - 30 * 86400000).toISOString(),
            windowEnd: periodEnd.toISOString(),
          });
        }
      }
    }

    return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  async sendDunning(shopDomain: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopDomain },
      include: { memberships: { include: { user: true }, take: 1 } },
    });
    if (!shop) throw new NotFoundException('shop not found');
    const ownerEmail = shop.memberships[0]?.user.email ?? null;
    await this.prisma.knowledgeSyncJob.create({
      data: {
        shopDomain,
        kind: 'ops:dunning',
        externalId: `${shopDomain}:dunning:${Date.now()}`,
        status: 'queued',
        payload: JSON.stringify({
          sentAt: new Date().toISOString(),
          ownerEmail,
          note: 'email dispatch pending — job queued for outbound worker',
        }),
      },
    });
    return { message: '已排队催缴提醒', queued: true };
  }

  async extendFreeze(shopDomain: string, days = 7) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopDomain },
      include: { subscriptions: true },
    });
    if (!shop?.subscriptions[0]) throw new NotFoundException('subscription not found');
    const updated = await this.mirror.extendUnfreeze(shop.subscriptions[0].id, days);
    return { unfreezeBy: updated.unfreezeBy?.toISOString() ?? null };
  }

  async setBillingShop(shopDomain: string, targetDomain?: string) {
    const domain = targetDomain?.trim() || shopDomain;
    const sub = await this.billing.setBillingShop(domain);
    return { shopDomain: domain, isBillingShop: sub.isBillingShop };
  }

  async resync(shopDomain: string) {
    const job = await this.prisma.knowledgeSyncJob.create({
      data: {
        shopDomain,
        kind: 'ops:resync',
        externalId: `${shopDomain}:resync:${Date.now()}`,
        status: 'running',
      },
    });
    try {
      const result = await this.shopify.startBatchSync(shopDomain);
      await this.prisma.knowledgeSyncJob.update({
        where: { id: job.id },
        data: {
          status: 'done',
          payload: JSON.stringify(result),
        },
      });
      return { message: '已排队重跑同步', started: result.started };
    } catch (err) {
      await this.prisma.knowledgeSyncJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          payload: String(err),
        },
      });
      throw err;
    }
  }

  async impersonate(shopDomain: string, actorEmail: string) {
    const shop = await this.prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) throw new NotFoundException('shop not found');
    const token = this.jwt.sign(
      {
        sub: shop.id,
        shop: shop.shopDomain,
        tenantId: shop.tenantId,
        typ: 'shop',
        impersonatedBy: actorEmail,
        impersonation: true,
      },
      { expiresIn: 30 * 60 },
    );
    return {
      accessToken: token,
      expiresIn: 30 * 60,
      shopDomain,
      banner: '代登录模式 — 操作将记入审计',
    };
  }

  async disableWidget(shopDomain: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopDomain },
      include: { botSetting: true },
    });
    if (!shop) throw new NotFoundException('shop not found');
    if (shop.botSetting) {
      await this.prisma.botSetting.update({
        where: { id: shop.botSetting.id },
        data: { widgetVisible: false },
      });
    }
    return { widgetVisible: false, reversible: true };
  }

  async enableWidget(shopDomain: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopDomain },
      include: { botSetting: true },
    });
    if (!shop?.botSetting) throw new NotFoundException('bot setting not found');
    await this.prisma.botSetting.update({
      where: { id: shop.botSetting.id },
      data: { widgetVisible: true },
    });
    return { widgetVisible: true };
  }
}

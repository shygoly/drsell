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
import { evaluateServiceability } from '../subscription/subscription-state';
import { listOpsPlans, resolveOpsPlan } from './ops-plan.config';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  summarizeDeploy,
  tokenRows,
  type DeployManifest,
} from './deploy-status';
import { decideSecretDeletion } from './webhook-secret-decision';
import { createHash } from 'node:crypto';

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

  /**
   * 订阅闸门的观测清单（openspec tasks 3.2）。
   *
   * 观测期里只有一行 `subscription gate OBSERVE` 日志，而 pm2 日志会滚掉，
   * 也没法回答「现在一共有几个店会被拦」。开闸（3.3）是不可逆的商家体验损失，
   * 决策前必须有一份能逐店核对的清单。
   *
   * **取数必须与闸门完全一致**，否则控制台会撒谎：`listShops` 用的是
   * `subscriptions[0]`（无序），而 `QuotaService.latestSubscription` 用
   * `orderBy updatedAt desc`。同店多条订阅时两者会指向不同的行，
   * 控制台说「放行」而闸门实际拦下——这种谎比没有清单更糟。
   * 判定本身直接调 `evaluateServiceability`，不在这里重写一遍规则。
   *
   * `lastSyncedAt` 是判断「是不是误判」的关键：从未同步过的镜像，
   * 它的 `currentPeriodEnd` 不代表 Shopify 的事实，据此停服就是误停。
   */
  async subscriptionGate(now = new Date()) {
    const shops = await this.prisma.shop.findMany({
      orderBy: { shopDomain: 'asc' },
      select: {
        id: true,
        shopDomain: true,
        subscriptions: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            status: true,
            planCode: true,
            trialEnds: true,
            currentPeriodEnd: true,
            isTest: true,
            updatedAt: true,
          },
        },
      },
    });

    const syncs = await this.prisma.knowledgeSyncJob.findMany({
      where: { kind: 'billing:sync', shopDomain: { in: shops.map((s) => s.shopDomain) } },
      orderBy: { createdAt: 'desc' },
      select: { shopDomain: true, createdAt: true },
    });
    const lastSync = new Map<string, Date>();
    for (const j of syncs) if (!lastSync.has(j.shopDomain)) lastSync.set(j.shopDomain, j.createdAt);

    const rows = shops.map((shop) => {
      const sub = shop.subscriptions[0] ?? null;
      const verdict = evaluateServiceability(sub, now);
      return {
        shopDomain: shop.shopDomain,
        serviceable: verdict.serviceable,
        reason: verdict.reason,
        graceEndsAt: verdict.graceEndsAt?.toISOString() ?? null,
        status: sub?.status ?? null,
        planCode: sub?.planCode ?? null,
        isTest: sub?.isTest ?? false,
        trialEnds: sub?.trialEnds?.toISOString() ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
        mirrorUpdatedAt: sub?.updatedAt?.toISOString() ?? null,
        lastSyncedAt: lastSync.get(shop.shopDomain)?.toISOString() ?? null,
      };
    });

    return {
      // 开关读的是 API 进程的环境变量——控制台必须显示它，否则没人知道
      // 现在这份清单是「会拦」还是「已经在拦」。
      enforcing: process.env.SUBSCRIPTION_GATE_ENFORCE === 'true',
      evaluatedAt: now.toISOString(),
      blockedCount: rows.filter((r) => !r.serviceable).length,
      neverSyncedCount: rows.filter((r) => !r.lastSyncedAt).length,
      shops: rows,
    };
  }

  /**
   * 部署与配置实况（openspec ops-deploy-observability）。
   *
   * 数据来自部署时生成的 `deploy-manifest.json`，不是应用自省——应用无法可靠
   * 知道自己是哪个 commit 构建的（design D1）。清单里只有指纹，没有值。
   *
   * 进程覆盖面要说实话：这里只能精确报出 **API 自己** 的启动时刻。
   * 另外三个是独立的 Next 进程，本服务不 exec pm2 去问它们——为一个只读视图
   * 给 API 开进程执行能力不划算。它们是否活着由公网断言覆盖。
   */
  async deployStatus(now = new Date()) {
    const file = process.env.DEPLOY_MANIFEST_PATH || join(process.cwd(), '..', '..', 'deploy-manifest.json');
    let manifest: DeployManifest | null = null;
    try {
      if (existsSync(file)) manifest = JSON.parse(readFileSync(file, 'utf8')) as DeployManifest;
    } catch {
      manifest = null; // 坏 JSON 与缺失同等对待：都是「不知道」，不是「没问题」
    }
    const deploy = summarizeDeploy(manifest);

    const apiStartedAt = new Date(now.getTime() - Math.floor(process.uptime()) * 1000);
    // API 比清单还老 = 这次部署没重启到它，页面上看到的版本是假的
    const apiStale = deploy.builtAt ? apiStartedAt < new Date(deploy.builtAt) : false;

    const shops = await this.prisma.shop.findMany({
      select: {
        shopDomain: true,
        accessToken: true,
        refreshToken: true,
        accessTokenExpiresAt: true,
        uninstalledAt: true,
      },
      orderBy: { shopDomain: 'asc' },
    });

    const [appliedHead] = await this.prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1',
    ).catch(() => [] as Array<{ migration_name: string }>);

    return {
      ...deploy,
      manifestPath: file,
      api: {
        startedAt: apiStartedAt.toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        stale: apiStale,
        note: apiStale
          ? 'API 进程比部署清单还早启动——本次部署没有重启到它，上面的版本号不代表正在运行的代码'
          : null,
      },
      migration: {
        headInCode: deploy.migrationHeadInCode,
        headApplied: appliedHead?.migration_name ?? null,
        consistent:
          !deploy.migrationHeadInCode || appliedHead?.migration_name === deploy.migrationHeadInCode,
      },
      tokens: tokenRows(
        shops.map((s) => ({
          shopDomain: s.shopDomain,
          accessTokenExpiresAt: s.accessTokenExpiresAt,
          hasRefreshToken: Boolean(s.refreshToken),
          uninstalledAt: s.uninstalledAt,
        })),
        now,
      ),
      evaluatedAt: now.toISOString(),
    };
  }

  /**
   * 旧密钥还能不能删（openspec tasks 0.1）。
   *
   * `SHOPIFY_API_SECRET_PREVIOUS` 目前是 webhook 能通过的**必要条件**。
   * 删早了所有 webhook 同时 401，而 `app_subscriptions/update` 是付款解冻的
   * 唯一渠道——那等于让付了钱的商家恢复不了服务。
   *
   * 判据必须是证据而不是感觉：**每一个见过的 topic 都已改用新密钥**，
   * 且旧密钥已连续 `quietDays` 天没有再命中。只看整体会漏掉个别 topic
   * （实测 `app/scopes_update` 就比其他 topic 晚切）。
   */
  async webhookSecretStatus(now = new Date(), quietDays = 14) {
    const rows = await this.prisma.webhookSecretUse.findMany({
      orderBy: [{ generation: 'asc' }, { topic: 'asc' }],
    });
    const fp = (v?: string | null) =>
      v ? createHash('sha256').update(v).digest('hex').slice(0, 12) : null;
    const decision = decideSecretDeletion({
      rows,
      configured: Boolean(process.env.SHOPIFY_API_SECRET_PREVIOUS),
      quietDays,
      now,
      currentFp: fp(process.env.SHOPIFY_API_SECRET),
      previousFp: fp(process.env.SHOPIFY_API_SECRET_PREVIOUS),
      latestFp: process.env.SHOPIFY_API_SECRET_LATEST_FP || null,
    });

    return {
      previousSecretConfigured: Boolean(process.env.SHOPIFY_API_SECRET_PREVIOUS),
      safeToDelete: decision.safeToDelete,
      reason: decision.reason,
      quietDays,
      observedForDays: decision.observedForDays,
      lastPreviousAt: decision.lastPreviousAt,
      quietForDays: decision.quietForDays,
      stillOnPreviousTopics: decision.stillOnPreviousTopics,
      topicsSeenOnCurrent: decision.topicsSeenOnCurrent,
      latestSlot: decision.latestSlot,
      observations: rows.map((r) => ({
        generation: r.generation,
        topic: r.topic,
        count: r.count,
        firstSeenAt: r.firstSeenAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
      })),
    };
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
    // AI 用量读 AiUsage.answers——那是 QuotaService 维护、真正决定拦不拦对话的
    // 权威计数器。这里以前读 ChatStatDaily.aiResolvedCount（AI 消息数），
    // 与配额是两套数，且该列在会话口径改版后已停写。
    const [stats, aiUsage] = await Promise.all([
      this.prisma.chatStatDaily.aggregate({
        where: statsWhere,
        _sum: { count: true },
      }),
      this.prisma.aiUsage.aggregate({
        where: {
          shopId: shop.id,
          ...(periodStart ? { periodStart: { gte: periodStart } } : {}),
        },
        _sum: { answers: true },
      }),
    ]);
    const agentSeatsUsed = await this.prisma.membership.count({ where: { shopId: shop.id } });
    const owner = shop.memberships[0]?.user;
    let accountShopCount: number | null = null;
    if (owner) {
      accountShopCount = await this.prisma.membership.count({
        where: { userId: owner.id },
      });
    }
    const chatUsed = stats._sum.count ?? 0;
    const aiResolvedUsed = aiUsage._sum.answers ?? 0;
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
      /** 稿子屏 08 的「授权范围」卡：Shop.scopes 是逗号分隔的 OAuth scope */
      scopes: shop.scopes ? shop.scopes.split(',').map((x) => x.trim()).filter(Boolean) : [],
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

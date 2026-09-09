import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import '@shopify/shopify-api/adapters/node';
import { ApiVersion, shopifyApi } from '@shopify/shopify-api';
import { verifyShopifyWebhookHmacDetailed, shopifyGraphql } from '@drsell/shopify';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AuthService } from '../auth/auth.service';
import { AdpService } from '../adp/adp.service';
import { BillingService } from '../subscription/billing.service';

const PRODUCT_QUERY = `
  query SyncProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        descriptionHtml
        handle
        vendor
        productType
        status
        tags
        totalInventory
        publishedAt
        priceRangeV2 { minVariantPrice { amount } }
        variants(first: 5) {
          nodes { id price inventoryQuantity }
        }
        images(first: 3) {
          nodes { url altText }
        }
      }
    }
  }
`;

const ORDER_QUERY = `
  query SyncOrders($first: Int!) {
    orders(first: $first) {
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        customer { id email displayName }
        billingAddress { formatted(withName: true) }
        shippingAddress { formatted(withName: true) }
      }
    }
  }
`;

const CUSTOMER_QUERY = `
  query SyncCustomers($first: Int!) {
    customers(first: $first) {
      nodes {
        id
        displayName
        email
        phone
      }
    }
  }
`;

function gidTail(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1] || gid;
}

function dec(v: unknown): Decimal | undefined {
  if (v == null || v === '') return undefined;
  return new Decimal(String(v));
}

/**
 * 同步任务的心跳间隔与超时阈值。
 *
 * 超时判定必须基于心跳而不是创建时间：上万商品的店铺同步本来就慢，
 * 按 createdAt 判会把健康的长任务误杀。
 */
const SYNC_HEARTBEAT_MS = 30_000;
const SYNC_STALE_MS = 5 * 60_000;

@Injectable()
export class ShopifyService implements OnModuleInit {
  private readonly logger = new Logger(ShopifyService.name);

  /**
   * 启动清理：把心跳停摆的 running 任务推向终态。
   *
   * runSyncJob 是 void 出去的进程内异步——进程在同步中途被重启，job 就永远停在
   * 'running'，而 startBatchSync 的并发守卫（if (running) continue）会让该店该类目
   * 再也不启动同步。商品目录静默陈旧，agent 继续拿旧数据回答顾客，无任何告警。
   *
   * 幂等：多实例同时启动只会把同一批行重复写成同样的终态。
   */
  async onModuleInit() {
    const staleBefore = new Date(Date.now() - SYNC_STALE_MS);
    try {
      const { count } = await this.prisma.knowledgeSyncJob.updateMany({
        where: {
          status: 'running',
          OR: [
            { heartbeatAt: null },
            { heartbeatAt: { lt: staleBefore } },
          ],
        },
        data: {
          status: 'failed',
          payload: '进程中断：心跳停摆，由启动清理判定为孤儿任务（非 Shopify 错误）',
        },
      });
      if (count > 0) {
        this.logger.warn(`released ${count} orphaned sync job(s) left running by a previous process`);
      }
    } catch (err) {
      // 清理失败不该拦住 API 启动，但必须留痕——否则同步会静默地一直堵着。
      this.logger.error(`orphaned sync job cleanup failed: ${String(err)}`);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly auth: AuthService,
    private readonly adp: AdpService,
    private readonly billing: BillingService,
  ) {}

  private secret() {
    return process.env.SHOPIFY_API_SECRET || '';
  }

  private shopifyClient() {
    return shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY || '',
      apiSecretKey: this.secret(),
      scopes: [],
      hostName: 'drsell.szchada.top',
      apiVersion: ApiVersion.July26,
      isEmbeddedApp: true,
    });
  }

  async login(params: {
    shop: string;
    accessToken?: string;
    scopes?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: string | Date | null;
    refreshTokenExpiresAt?: string | Date | null;
  }) {
    if (!params.shop) throw new BadRequestException('shop required');
    const toDate = (v?: string | Date | null) =>
      v == null || v === '' ? null : v instanceof Date ? v : new Date(v);
    const shop = await this.tenants.ensureShopTenant(
      params.shop,
      params.accessToken,
      params.scopes,
      undefined,
      params.accessToken
        ? {
            refreshToken: params.refreshToken ?? null,
            accessTokenExpiresAt: toDate(params.accessTokenExpiresAt),
            refreshTokenExpiresAt: toDate(params.refreshTokenExpiresAt),
          }
        : undefined,
    );
    const token = this.auth.signShopSession({
      shop: shop.shopDomain,
      tenantId: shop.tenantId,
      shopRecordId: shop.id,
    });
    return { shop, ...token };
  }

  /**
   * App Bridge session token 换发本服务 JWT。
   * 前端通过 @shopify/app-bridge-react 的 `shopify.idToken()` 获取 token，
   * 后端用 @shopify/shopify-api 的 decodeSessionToken 校验。
   */
  async loginWithAppBridgeSessionToken(sessionToken: string) {
    if (!sessionToken) throw new BadRequestException('sessionToken required');
    let payload;
    try {
      payload = await this.shopifyClient().session.decodeSessionToken(
        sessionToken,
        { checkAudience: true },
      );
    } catch (error) {
      throw new UnauthorizedException(
        `Invalid Shopify session token: ${(error as Error).message}`,
      );
    }
    const shopDomain = payload.dest
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    const shop = await this.tenants.ensureShopTenant(shopDomain);
    const token = this.auth.signShopSession({
      shop: shop.shopDomain,
      tenantId: shop.tenantId,
      shopRecordId: shop.id,
    });
    return { shop, ...token };
  }

  async getOrCreateBotSetting(shopDomain: string) {
    const shop = await this.tenants.ensureShopTenant(shopDomain);
    return this.prisma.botSetting.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, shopName: shop.shopDomain },
      update: {},
    });
  }

  async updateBotSetting(
    shopDomain: string,
    data: {
      shopName?: string;
      botId?: string;
      chatLogo?: string;
      chatAvatar?: string;
      widgetPrimaryColor?: string;
      widgetHeaderColor?: string;
      widgetPosition?: string;
      widgetWindowSize?: string;
      widgetLauncherStyle?: string;
      widgetVisible?: boolean;
      widgetQuickReplies?: string[];
      welcomeMessage?: string;
    },
  ) {
    const setting = await this.getOrCreateBotSetting(shopDomain);
    return this.prisma.botSetting.update({
      where: { id: setting.id },
      data: {
        ...data,
        widgetQuickReplies: data.widgetQuickReplies
          ? (data.widgetQuickReplies as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  private toOnboardingState(setting: {
    onboardingStep: string;
    embedLiveAt: Date | null;
    onboardingCompletedAt: Date | null;
    widgetPrimaryColor: string | null;
    widgetPosition: string | null;
    welcomeMessage: string | null;
    syncProductsEnabled: boolean;
    syncOrdersEnabled: boolean;
    syncCustomersEnabled: boolean;
  }) {
    const position =
      setting.widgetPosition === 'bottom-left' ? 'bottom-left' : 'bottom-right';
    return {
      step: setting.onboardingStep as '1' | '2' | '3' | '5' | 'done',
      embedLiveAt: setting.embedLiveAt?.toISOString() ?? null,
      onboardingCompletedAt: setting.onboardingCompletedAt?.toISOString() ?? null,
      widgetPrimaryColor: setting.widgetPrimaryColor ?? '#008060',
      widgetPosition: position,
      welcomeMessage: setting.welcomeMessage,
      syncProductsEnabled: setting.syncProductsEnabled,
      syncOrdersEnabled: setting.syncOrdersEnabled,
      syncCustomersEnabled: setting.syncCustomersEnabled,
      activated: Boolean(setting.embedLiveAt),
    };
  }

  async getOnboardingState(shopDomain: string) {
    const setting = await this.getOrCreateBotSetting(shopDomain);
    return this.toOnboardingState(setting);
  }

  async patchOnboardingState(
    shopDomain: string,
    body: {
      step?: string;
      widgetPrimaryColor?: string;
      widgetPosition?: string;
      welcomeMessage?: string;
      syncProductsEnabled?: boolean;
      syncOrdersEnabled?: boolean;
      syncCustomersEnabled?: boolean;
      markEmbedLive?: boolean;
      complete?: boolean;
    },
  ) {
    const setting = await this.getOrCreateBotSetting(shopDomain);
    const data: Record<string, unknown> = {};

    if (body.step !== undefined) data.onboardingStep = body.step;
    if (body.widgetPrimaryColor !== undefined) data.widgetPrimaryColor = body.widgetPrimaryColor;
    if (body.widgetPosition !== undefined) data.widgetPosition = body.widgetPosition;
    if (body.welcomeMessage !== undefined) data.welcomeMessage = body.welcomeMessage;
    if (body.syncProductsEnabled !== undefined) {
      data.syncProductsEnabled = body.syncProductsEnabled;
    }
    if (body.syncOrdersEnabled !== undefined) data.syncOrdersEnabled = body.syncOrdersEnabled;
    if (body.syncCustomersEnabled !== undefined) {
      data.syncCustomersEnabled = body.syncCustomersEnabled;
    }
    if (body.markEmbedLive) {
      data.embedLiveAt = new Date();
      data.onboardingStep = '5';
    }
    if (body.complete) {
      data.onboardingCompletedAt = new Date();
      data.onboardingStep = 'done';
    }

    const updated = await this.prisma.botSetting.update({
      where: { id: setting.id },
      data,
    });
    return this.toOnboardingState(updated);
  }

  async startBatchSync(shopDomain: string) {
    const setting = await this.getOrCreateBotSetting(shopDomain);
    const shop = await this.tenants.getByShopDomain(shopDomain);
    const accessToken = shop ? await this.tenants.getValidAccessToken(shop) : null;
    if (!shop || !accessToken) {
      throw new BadRequestException(
        'shop missing access token: complete Shopify authorization first',
      );
    }
    const kinds: Array<'products' | 'orders' | 'customers'> = [];
    if (setting.syncProductsEnabled) kinds.push('products');
    if (setting.syncOrdersEnabled) kinds.push('orders');
    if (setting.syncCustomersEnabled) kinds.push('customers');

    const started: string[] = [];
    for (const kind of kinds) {
      const running = await this.prisma.knowledgeSyncJob.findFirst({
        where: { shopDomain, kind, status: 'running' },
      });
      if (running) continue;
      const job = await this.prisma.knowledgeSyncJob.create({
        data: {
          shopDomain,
          kind,
          externalId: `${shopDomain}:${kind}:${Date.now()}`,
          status: 'running',
          heartbeatAt: new Date(),
        },
      });
      started.push(kind);
      void this.runSyncJob(shopDomain, kind, job.id);
    }
    return { started };
  }

  private async runSyncJob(
    shopDomain: string,
    kind: 'products' | 'orders' | 'customers',
    jobId: string,
  ) {
    // 心跳让「还活着的长任务」和「进程死掉留下的尸体」区分得开。
    const beat = setInterval(() => {
      this.prisma.knowledgeSyncJob
        .update({ where: { id: jobId }, data: { heartbeatAt: new Date() } })
        .catch(() => undefined);
    }, SYNC_HEARTBEAT_MS);
    beat.unref?.();

    try {
      const result = await this.syncCatalog(shopDomain, kind);
      await this.prisma.knowledgeSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'done',
          payload: JSON.stringify({ count: result.count }),
        },
      });
    } catch (err) {
      await this.prisma.knowledgeSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          payload: String(err),
        },
      });
    } finally {
      clearInterval(beat);
    }
  }

  async getSyncStatus(shopDomain: string) {
    const shop = await this.tenants.getByShopDomain(shopDomain);
    const tenantId = shop?.tenantId;

    const kinds = ['products', 'orders', 'customers'] as const;
    const out: Record<
      string,
      {
        status: string;
        count?: number;
        lastSuccessAt: string | null;
        failureReason: string | null;
      }
    > = {};

    for (const kind of kinds) {
      // pushKnowledge 每次同步后都会追加一条 skipped 记录，过滤掉它，
      // 让状态反映真实的同步结果（done / failed / idle）。
      const [latest, lastSuccess] = await Promise.all([
        this.prisma.knowledgeSyncJob.findFirst({
          where: { shopDomain, kind, status: { not: 'skipped' } },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.knowledgeSyncJob.findFirst({
          where: { shopDomain, kind, status: 'done' },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
      ]);
      let count: number | undefined;
      if (tenantId) {
        if (kind === 'products') count = await this.prisma.product.count({ where: { tenantId } });
        if (kind === 'orders') count = await this.prisma.order.count({ where: { tenantId } });
        if (kind === 'customers') count = await this.prisma.customer.count({ where: { tenantId } });
      }
      out[kind] = {
        status: latest?.status ?? 'idle',
        count,
        // 目录静默陈旧是本缺陷最实际的危害——agent 拿旧数据回答顾客，商家不知情。
        // 「上次成功同步于何时」必须摆到商家眼前，光有 status 看不出陈旧了多久。
        lastSuccessAt: lastSuccess?.updatedAt?.toISOString() ?? null,
        failureReason: latest?.status === 'failed' ? (latest.payload ?? null) : null,
      };
    }

    return out;
  }

  /** 返回是否通过 + 命中的是哪把密钥（轮换窗口内可能仍是旧的）。 */
  verifyWebhook(rawBody: Buffer | string, hmac?: string) {
    return verifyShopifyWebhookHmacDetailed(
      rawBody,
      hmac,
      this.secret(),
      process.env.SHOPIFY_API_SECRET_PREVIOUS || undefined,
    );
  }

  async handleUninstall(shopDomain: string) {
    const shop = await this.tenants.getByShopDomain(shopDomain);
    if (!shop) return { ok: true };
    const billingSub = await this.prisma.subscription.findFirst({
      where: { shopId: shop.id, isBillingShop: true },
    });
    await this.prisma.shop.update({
      where: { id: shop.id },
      data: {
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        uninstalledAt: new Date(),
      },
    });
    await this.prisma.session.deleteMany({ where: { shopId: shop.id } });
    if (billingSub) {
      // billing shop 卸载：把计费转移到组内下一家店；失败留痕不静默吞掉。
      await this.billing
        .reassign(shop.tenantId, shop.id)
        .catch(async (e) => {
          await this.prisma.knowledgeSyncJob
            .create({
              data: {
                shopDomain: shop.shopDomain,
                kind: 'billing:reassign-failed',
                externalId: `${shop.shopDomain}:reassign:${Date.now()}`,
                status: 'failed',
                payload: String(e),
              },
            })
            .catch(() => undefined);
        });
    }
    return { ok: true };
  }

  /**
   * Shopify 强制合规 webhook（customers/data_request、customers/redact、shop/redact）。
   * 只留痕（ComplianceEvent）+ 记日志，绝不抛错——Shopify 要求合规端点必须快速返回 2xx。
   * shop/redact 刻意不复用 handleUninstall：后者会触发 billing.reassign（在其他店上
   * 创建真实 AppSubscription charge，非幂等，风险不可接受）。店铺数据删除仍由
   * app/uninstalled 流程负责——shop/redact 在店铺删除约 48h 后到达，届时卸载流程
   * 通常已完成（token 置空、session 清理）。
   */
  async handleComplianceEvent(
    topic: 'customers/data_request' | 'customers/redact' | 'shop/redact',
    shopDomain: string,
    payload: unknown,
  ) {
    let json: Prisma.InputJsonValue = {};
    if (payload && typeof payload === 'object') {
      json = payload as Prisma.InputJsonValue;
    } else {
      try {
        json = JSON.parse(String(payload)) as Prisma.InputJsonValue;
      } catch {
        json = { raw: String(payload ?? '') };
      }
    }
    try {
      await this.prisma.complianceEvent.create({
        data: { topic, shopDomain, payload: json },
      });
      this.logger.log(`compliance webhook ${topic} recorded for ${shopDomain}`);
    } catch (error) {
      // 留痕失败只记错误日志，不影响向 Shopify 返回 2xx。
      this.logger.error(
        `compliance webhook ${topic} persist failed for ${shopDomain}: ${
          (error as Error).message
        }`,
      );
    }
    return { ok: true, topic };
  }

  async listProducts(tenantId: string, take = 50) {
    return this.prisma.product.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  async listOrders(tenantId: string, customerId?: string, take = 50) {
    return this.prisma.order.findMany({
      where: { tenantId, ...(customerId ? { customerId } : {}) },
      orderBy: { shopifyCreatedAt: 'desc' },
      take,
    });
  }

  async syncCatalog(shopDomain: string, kind: 'products' | 'orders' | 'customers') {
    const shop = await this.tenants.getByShopDomain(shopDomain);
    const accessToken = shop ? await this.tenants.getValidAccessToken(shop) : null;
    if (!shop || !accessToken) {
      throw new BadRequestException('shop missing access token');
    }

    const first = Number(process.env.SHOPIFY_SYNC_PAGE_SIZE || 50);
    let persisted = 0;

    if (kind === 'products') {
      const result = await shopifyGraphql<{
        data: {
          products: {
            nodes: Array<{
              id: string;
              title: string;
              descriptionHtml?: string;
              handle?: string;
              vendor?: string;
              productType?: string;
              status?: string;
              tags?: string[];
              totalInventory?: number;
              publishedAt?: string;
              priceRangeV2?: { minVariantPrice?: { amount?: string } };
              variants?: { nodes: Array<{ price?: string; inventoryQuantity?: number }> };
              images?: { nodes: unknown[] };
            }>;
          };
        };
      }>({
        shop: shop.shopDomain,
        accessToken,
        query: PRODUCT_QUERY,
        variables: { first },
      });

      const nodes = result.data?.products?.nodes ?? [];
      for (const node of nodes) {
        const shopifyProductId = gidTail(node.id);
        const variant = node.variants?.nodes?.[0];
        const price =
          variant?.price ??
          node.priceRangeV2?.minVariantPrice?.amount ??
          null;
        await this.prisma.product.upsert({
          where: {
            tenantId_shopifyProductId: {
              tenantId: shop.tenantId,
              shopifyProductId,
            },
          },
          create: {
            tenantId: shop.tenantId,
            shopId: shop.id,
            shopifyProductId,
            name: node.title,
            price: dec(price),
            description: node.descriptionHtml ?? null,
            category: node.productType ?? null,
            stock: node.totalInventory ?? variant?.inventoryQuantity ?? null,
            handle: node.handle ?? null,
            vendor: node.vendor ?? null,
            status: node.status ?? null,
            tags: Array.isArray(node.tags) ? node.tags.join(',') : null,
            variantsJson: node.variants ? JSON.stringify(node.variants.nodes) : null,
            imagesJson: node.images ? JSON.stringify(node.images.nodes) : null,
            publishedAt: node.publishedAt ? new Date(node.publishedAt) : null,
            syncedAt: new Date(),
          },
          update: {
            shopId: shop.id,
            name: node.title,
            price: dec(price),
            description: node.descriptionHtml ?? null,
            category: node.productType ?? null,
            stock: node.totalInventory ?? variant?.inventoryQuantity ?? null,
            handle: node.handle ?? null,
            vendor: node.vendor ?? null,
            status: node.status ?? null,
            tags: Array.isArray(node.tags) ? node.tags.join(',') : null,
            variantsJson: node.variants ? JSON.stringify(node.variants.nodes) : null,
            imagesJson: node.images ? JSON.stringify(node.images.nodes) : null,
            publishedAt: node.publishedAt ? new Date(node.publishedAt) : null,
            syncedAt: new Date(),
          },
        });
        persisted += 1;
      }

      await this.pushKnowledge(shopDomain, shop.tenantId, kind, nodes);
      return { count: persisted, tenantId: shop.tenantId };
    }

    if (kind === 'orders') {
      const result = await shopifyGraphql<{
        data: {
          orders: {
            nodes: Array<{
              id: string;
              name?: string;
              createdAt?: string;
              displayFinancialStatus?: string;
              displayFulfillmentStatus?: string;
              totalPriceSet?: { shopMoney?: { amount?: string } };
              totalTaxSet?: { shopMoney?: { amount?: string } };
              customer?: { id?: string; email?: string; displayName?: string };
              billingAddress?: { formatted?: string[] };
              shippingAddress?: { formatted?: string[] };
            }>;
          };
        };
      }>({
        shop: shop.shopDomain,
        accessToken,
        query: ORDER_QUERY,
        variables: { first },
      });

      const nodes = result.data?.orders?.nodes ?? [];
      for (const node of nodes) {
        const shopifyOrderId = gidTail(node.id);
        const customerId = node.customer?.id ? gidTail(node.customer.id) : null;
        const total = node.totalPriceSet?.shopMoney?.amount ?? '0';
        await this.prisma.order.upsert({
          where: {
            tenantId_shopifyOrderId: {
              tenantId: shop.tenantId,
              shopifyOrderId,
            },
          },
          create: {
            tenantId: shop.tenantId,
            shopId: shop.id,
            shopifyOrderId,
            customerId,
            status: node.displayFinancialStatus ?? null,
            financialStatus: node.displayFinancialStatus ?? null,
            fulfillmentStatus: node.displayFulfillmentStatus ?? null,
            total: dec(total) ?? new Decimal(0),
            totalTax: dec(node.totalTaxSet?.shopMoney?.amount),
            billingAddress: node.billingAddress?.formatted
              ? JSON.stringify(node.billingAddress.formatted)
              : null,
            shippingAddress: node.shippingAddress?.formatted
              ? JSON.stringify(node.shippingAddress.formatted)
              : null,
            shopifyCreatedAt: node.createdAt ? new Date(node.createdAt) : null,
            syncedAt: new Date(),
          },
          update: {
            shopId: shop.id,
            customerId,
            status: node.displayFinancialStatus ?? null,
            financialStatus: node.displayFinancialStatus ?? null,
            fulfillmentStatus: node.displayFulfillmentStatus ?? null,
            total: dec(total) ?? new Decimal(0),
            totalTax: dec(node.totalTaxSet?.shopMoney?.amount),
            billingAddress: node.billingAddress?.formatted
              ? JSON.stringify(node.billingAddress.formatted)
              : null,
            shippingAddress: node.shippingAddress?.formatted
              ? JSON.stringify(node.shippingAddress.formatted)
              : null,
            shopifyCreatedAt: node.createdAt ? new Date(node.createdAt) : null,
            syncedAt: new Date(),
          },
        });
        persisted += 1;
      }

      await this.pushKnowledge(shopDomain, shop.tenantId, kind, nodes);
      return { count: persisted, tenantId: shop.tenantId };
    }

    const result = await shopifyGraphql<{
      data: {
        customers: {
          nodes: Array<{
            id: string;
            displayName?: string;
            email?: string;
            phone?: string;
          }>;
        };
      };
    }>({
      shop: shop.shopDomain,
      accessToken,
      query: CUSTOMER_QUERY,
      variables: { first },
    });

    const nodes = result.data?.customers?.nodes ?? [];
    for (const node of nodes) {
      const shopifyCustomerId = gidTail(node.id);
      await this.prisma.customer.upsert({
        where: {
          tenantId_shopifyCustomerId: {
            tenantId: shop.tenantId,
            shopifyCustomerId,
          },
        },
        create: {
          tenantId: shop.tenantId,
          shopId: shop.id,
          shopifyCustomerId,
          displayName: node.displayName ?? null,
          email: node.email ?? null,
          phone: node.phone ?? null,
          syncedAt: new Date(),
        },
        update: {
          shopId: shop.id,
          displayName: node.displayName ?? null,
          email: node.email ?? null,
          phone: node.phone ?? null,
          syncedAt: new Date(),
        },
      });
      persisted += 1;
    }

    await this.pushKnowledge(shopDomain, shop.tenantId, kind, nodes);
    return { count: persisted, tenantId: shop.tenantId };
  }

  private async pushKnowledge(
    shopDomain: string,
    tenantId: string,
    kind: string,
    _nodes: unknown[],
  ) {
    await this.prisma.knowledgeSyncJob.create({
      data: {
        shopDomain,
        kind,
        externalId: `${tenantId}:${kind}`,
        status: 'skipped',
        payload: 'ADP 知识库同步已停用：智能体改为直连 PG 实时查询（ADR-7）',
      },
    });
  }

  async todayChatStats(shopDomain: string) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const row = await this.prisma.chatStatDaily.findUnique({
      where: { shopDomain_day: { shopDomain, day } },
    });
    return { shopDomain, day, count: row?.count ?? 0, aiResolvedCount: row?.aiResolvedCount ?? 0 };
  }
}

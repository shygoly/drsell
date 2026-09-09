import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { shopifyGraphql } from '@drsell/shopify';
import { DEFAULT_PLAN, PLANS, PlanCode, planOf } from '@drsell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

/**
 * 套餐来自 @drsell/shared 的 PLANS —— 价格与配额的唯一事实来源，
 * 也是 App Store listing 上必须写的那份。此前这里是单一 env 价格
 * （BILLING_PLAN_PRICE，回落 9.9），与「两档」的对外说法不符。
 *
 * BILLING_TEST=1 时创建 test charge，供开发店验证而不真实扣费。
 */
const BILLING_TEST = process.env.BILLING_TEST === '1';
const APP_URL = process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top';

/**
 * Shopify 套餐名 → 我们的 PlanCode。
 *
 * Partner 后台的 App Pricing 方案里，plan name 与 internal handle 是**刻意**
 * 按 PLANS 对齐的（name "Basic"/"Pro"，handle "basic"/"pro"），所以两边都能匹配上。
 * 对不上时返回 null，**绝不回落到 basic**——那会把一个付 $30 的商家
 * 悄悄降级成 1500 次额度，而且没有任何人会发现。
 */
export function planCodeFromShopifyName(
  name: string | null | undefined,
): PlanCode | null {
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return null;
  const codes = Object.keys(PLANS) as PlanCode[];
  return codes.find((c) => c === n || PLANS[c].name.toLowerCase() === n) ?? null;
}

type ChargeResult = {
  appSubscription?: { id: string; status?: string } | null;
  confirmationUrl?: string | null;
  userErrors?: Array<{ field?: string[] | null; message: string }>;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  private async shopWithToken(shopDomain: string) {
    const shop = await this.tenants.getByShopDomain(shopDomain);
    const token = shop ? await this.tenants.getValidAccessToken(shop) : null;
    if (!shop || !token) {
      throw new BadRequestException('shop missing access token');
    }
    return { shop, token };
  }

  private async createCharge(shopDomain: string, planCode: PlanCode) {
    const plan = planOf(planCode);
    const { token } = await this.shopWithToken(shopDomain);
    const returnUrl = `${APP_URL}/settings?shop=${encodeURIComponent(shopDomain)}`;
    const res = await shopifyGraphql<{
      data: { appSubscriptionCreate: ChargeResult };
    }>({
      shop: shopDomain,
      accessToken: token,
      query: `
        mutation appSubscriptionCreate(
          $name: String!, $returnUrl: URL!, $test: Boolean!, $price: Decimal!
        ) {
          appSubscriptionCreate(
            name: $name, returnUrl: $returnUrl, test: $test,
            lineItems: [{
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: $price, currencyCode: USD }
                  interval: EVERY_30_DAYS
                }
              }
            }]
          ) {
            userErrors { field message }
            appSubscription { id status }
            confirmationUrl
          }
        }
      `,
      variables: {
        name: plan.name,
        returnUrl,
        test: BILLING_TEST,
        price: String(plan.price),
      },
    });
    const result = res.data?.appSubscriptionCreate;
    if (!result || (result.userErrors?.length ?? 0) > 0) {
      throw new Error(
        `billing charge failed: ${JSON.stringify(result?.userErrors ?? result)}`,
      );
    }
    return result;
  }

  private async cancelCharge(shopDomain: string, chargeId: string | null) {
    if (!chargeId) return;
    const { token } = await this.shopWithToken(shopDomain);
    const res = await shopifyGraphql<{
      data: {
        appSubscriptionCancel: {
          userErrors?: Array<{ field?: string[] | null; message: string }>;
          appSubscription?: { id: string; status?: string } | null;
        };
      };
    }>({
      shop: shopDomain,
      accessToken: token,
      query: `
        mutation appSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            userErrors { field message }
            appSubscription { id status }
          }
        }
      `,
      variables: { id: chargeId },
    });
    const errs = res.data?.appSubscriptionCancel?.userErrors;
    if (errs && errs.length > 0) {
      throw new Error(`billing cancel failed: ${JSON.stringify(errs)}`);
    }
  }

  /**
   * 留痕。`shopDomain` 列**必须写店铺域名**——2026-09-09 之前这里写的是 tenantId，
   * 于是运营台按域名查 `billing:sync` 永远查不到，把刚同步过的店报成
   * 「镜像从未与 Shopify 同步过」。那条警告恰恰用来支撑「要不要开闸停服」
   * 这个不可逆决策，说谎的代价很高。
   *
   * 租户级事件（reassign 一类）没有单一店铺，退回写 tenantId：
   * 它们本来就不该被按店查询命中。
   */
  private async log(
    tenantId: string,
    kind: string,
    payload: string,
    shopDomain?: string | null,
  ) {
    await this.prisma.knowledgeSyncJob.create({
      data: {
        shopDomain: shopDomain ?? tenantId,
        kind: `billing:${kind}`,
        externalId: `${tenantId}:${kind}:${Date.now()}`,
        status: 'done',
        payload,
      },
    });
  }

  /** 一组店铺的订阅状态（只读） */
  statusForShops(shopIds: string[]) {
    if (!shopIds.length) return Promise.resolve([]);
    return this.prisma.subscription.findMany({
      where: { shopId: { in: shopIds } },
    });
  }

  /** 组内指定一家店收全额，其余店建 $0 charge；转移失败留痕，不静默吞掉 */
  /**
   * 指定收费店并创建订阅。planCode 决定价格与 AI 回答额度（见 @drsell/shared 的 PLANS）；
   * 不传时沿用该店已有套餐，仍没有就落到 DEFAULT_PLAN。
   */
  async setBillingShop(shopDomain: string, planCode?: PlanCode) {
    const { shop } = await this.shopWithToken(shopDomain);
    const group = await this.prisma.shop.findMany({
      where: { tenantId: shop.tenantId },
      include: { subscriptions: true },
    });
    const current = group.find((s) =>
      s.subscriptions.some((sub) => sub.isBillingShop),
    );

    try {
      if (current) {
        const currentSub = current.subscriptions.find(
          (sub) => sub.isBillingShop,
        );
        await this.cancelCharge(
          current.shopDomain,
          currentSub?.shopifyChargeId ?? null,
        );
        await this.prisma.subscription.updateMany({
          where: { shopId: current.id },
          data: { isBillingShop: false },
        });
      }
      const existingSub = await this.prisma.subscription.findFirst({
        where: { shopId: shop.id },
        select: { planCode: true },
      });
      const chosen: PlanCode =
        planCode ?? planOf(existingSub?.planCode ?? DEFAULT_PLAN).code;
      const created = await this.createCharge(shop.shopDomain, chosen);
      const existing = await this.prisma.subscription.findFirst({
        where: { shopId: shop.id },
      });
      const sub = existing
        ? await this.prisma.subscription.update({
            where: { id: existing.id },
            data: {
              isBillingShop: true,
              shopifyChargeId: created.appSubscription?.id ?? null,
              status: 'ACTIVE',
              planCode: chosen,
            },
          })
        : await this.prisma.subscription.create({
            data: {
              shopId: shop.id,
              planCode: chosen,
              status: 'ACTIVE',
              isBillingShop: true,
              shopifyChargeId: created.appSubscription?.id ?? null,
            },
          });
      await this.log(
        shop.tenantId,
        'switch',
        `billing shop -> ${shop.shopDomain} (${created.appSubscription?.id ?? 'pending'})`,
        shop.shopDomain,
      );
      return sub;
    } catch (e) {
      await this.log(
        shop.tenantId,
        'switch-failed',
        String(e),
      ).catch(() => undefined);
      throw e;
    }
  }

  /** billing shop 卸载后把计费转移到组内下一家有订阅的店（没有则第一家店） */
  async reassign(tenantId: string, uninstalledShopId?: string) {
    const group = await this.prisma.shop.findMany({
      where: { tenantId, uninstalledAt: null },
      include: { subscriptions: true },
    });
    const next =
      group.find((s) => s.subscriptions.length > 0 && s.id !== uninstalledShopId) ??
      group.find((s) => s.id !== uninstalledShopId);
    if (!next) {
      await this.log(
        tenantId,
        'reassign',
        'no remaining shop in tenant to move billing to',
      );
      return null;
    }
    try {
      // next 是 Shop，套餐在它的 subscriptions 上；沿用原套餐，缺失时落 DEFAULT_PLAN。
      const nextPlan = planOf(next.subscriptions[0]?.planCode ?? DEFAULT_PLAN).code;
      const created = await this.createCharge(next.shopDomain, nextPlan);
      const existing = await this.prisma.subscription.findFirst({
        where: { shopId: next.id },
      });
      if (existing) {
        await this.prisma.subscription.update({
          where: { id: existing.id },
          data: {
            isBillingShop: true,
            shopifyChargeId: created.appSubscription?.id ?? null,
            status: 'ACTIVE',
            planCode: nextPlan,
          },
        });
      } else {
        await this.prisma.subscription.create({
          data: {
            shopId: next.id,
            planCode: nextPlan,
            status: 'ACTIVE',
            isBillingShop: true,
            shopifyChargeId: created.appSubscription?.id ?? null,
          },
        });
      }
      await this.log(
        tenantId,
        'reassign',
        `billing moved -> ${next.shopDomain} (${created.appSubscription?.id ?? 'pending'})`,
      );
      return next;
    } catch (e) {
      await this.log(
        tenantId,
        'reassign-failed',
        String(e),
      ).catch(() => undefined);
      throw e;
    }
  }

  /**
   * 从 Shopify 拉取当前订阅并写回本地（app_subscriptions/update webhook 的落点）。
   *
   * 本 app 开了 Shopify App Pricing（原 Managed Pricing），商家在 **Shopify 自己的
   * 界面**选套餐，不经过上面的 createCharge。
   *
   * ⚠ **调用方 `app_subscriptions/update` 已经不会再触发了。**
   * Shopify 文档原文：「After April 28, 2026, Shopify App Pricing no longer sends
   * webhooks for subscription changes. Use the Partner API and URL redirect
   * parameters instead.」——今天已是 2026-09，该 webhook 停了四个月。
   *
   * 这解释了生产上的全部异常：chatbotdomaintest 的镜像在 2025-08-25 停了一整年，
   * 而 `billing:sync` 仅有的几条全是 2026-09-09 人工发自签 webhook 触发的。
   * **订阅镜像目前没有任何自动数据源**，闸门与配额都建立在一份不会更新的镜像上。
   *
   * 替代方案是 Partner API 的 `activeSubscription(appId:, shopId:)` 加上商家选完
   * 套餐后回跳带的 `plan_handle` 参数。本函数（回查 Admin API 的
   * currentAppInstallation.activeSubscriptions）作为过渡仍然可用——它读的是
   * 订阅合同本身，不依赖 webhook——但必须有东西来**调用**它，
   * 而那个东西现在不存在。
   *
   * webhook 载荷里没有 currentPeriodEnd，而配额周期要靠它，所以这里不信载荷、
   * 回查 Shopify 拿权威值。
   */
  async syncFromShopify(shopDomain: string) {
    const { shop, token } = await this.shopWithToken(shopDomain);
    const res = await shopifyGraphql<{
      data: {
        currentAppInstallation?: {
          activeSubscriptions?: Array<{
            id: string;
            name?: string | null;
            status?: string | null;
            test?: boolean | null;
            currentPeriodEnd?: string | null;
          }> | null;
        } | null;
      };
    }>({
      shop: shopDomain,
      accessToken: token,
      query: `
        {
          currentAppInstallation {
            activeSubscriptions { id name status test currentPeriodEnd }
          }
        }
      `,
    });

    const active = res.data?.currentAppInstallation?.activeSubscriptions?.[0] ?? null;
    const existing = await this.prisma.subscription.findFirst({
      where: { shopId: shop.id },
      orderBy: { updatedAt: 'desc' },
    });

    // Shopify 说没有活跃订阅 —— 以 Shopify 为准置为 CANCELLED，别留一条假的 ACTIVE。
    if (!active) {
      if (existing && existing.status !== 'CANCELLED') {
        await this.prisma.subscription.update({
          where: { id: existing.id },
          data: { status: 'CANCELLED', isBillingShop: false },
        });
        await this.log(
          shop.tenantId,
          'sync',
          `${shopDomain}: no active subscription -> CANCELLED`,
          shopDomain,
        );
      }
      return null;
    }

    const mapped = planCodeFromShopifyName(active.name);
    if (!mapped) {
      // 对不上就不动 planCode：宁可保持原样，也不要把付费商家悄悄降级。
      this.logger.error(
        `unmapped Shopify plan name ${JSON.stringify(active.name)} for ${shopDomain} — ` +
          'planCode left unchanged; align the App Pricing plan name with @drsell/shared PLANS',
      );
      await this.log(
        shop.tenantId,
        'sync-unmapped-plan',
        `${shopDomain}: ${active.name}`,
        shopDomain,
      );
    }

    const data = {
      status: (active.status || 'ACTIVE').toUpperCase(),
      shopifyChargeId: active.id,
      currentPeriodEnd: active.currentPeriodEnd ? new Date(active.currentPeriodEnd) : null,
      // 测试扣款不续期，周期终点会永远停在第一期——必须记下来，否则可服务
      // 判定会把开发店（含 Shopify 审核员用的店）判成「周期已过」而停服。
      isTest: active.test === true,
      isBillingShop: true,
      ...(mapped ? { planCode: mapped } : {}),
    };

    const sub = existing
      ? await this.prisma.subscription.update({ where: { id: existing.id }, data })
      : await this.prisma.subscription.create({
          data: { shopId: shop.id, planCode: mapped ?? DEFAULT_PLAN, ...data },
        });

    // 日志用已知的入参拼，不解引用写入返回值——写已经成功了，
    // 记日志不该有能力让整个 webhook 处理抛错。
    await this.log(
      shop.tenantId,
      'sync',
      `${shopDomain}: ${mapped ?? existing?.planCode ?? DEFAULT_PLAN} ${data.status} ` +
        `until ${data.currentPeriodEnd?.toISOString() ?? '-'}${data.isTest ? ' [test]' : ''}`,
      shopDomain,
    );
    return sub;
  }
}

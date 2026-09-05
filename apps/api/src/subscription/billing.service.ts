import { BadRequestException, Injectable } from '@nestjs/common';
import { shopifyGraphql } from '@drsell/shopify';
import { DEFAULT_PLAN, PlanCode, planOf } from '@drsell/shared';
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

type ChargeResult = {
  appSubscription?: { id: string; status?: string } | null;
  confirmationUrl?: string | null;
  userErrors?: Array<{ field?: string[] | null; message: string }>;
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  private async shopWithToken(shopDomain: string) {
    const shop = await this.tenants.getByShopDomain(shopDomain);
    const token = shop ? this.tenants.getShopAccessToken(shop) : null;
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

  private async log(tenantId: string, kind: string, payload: string) {
    await this.prisma.knowledgeSyncJob.create({
      data: {
        shopDomain: tenantId,
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
}

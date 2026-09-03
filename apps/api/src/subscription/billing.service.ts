import { BadRequestException, Injectable } from '@nestjs/common';
import { shopifyGraphql } from '@drsell/shopify';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

const PLAN_CODE = process.env.BILLING_PLAN_CODE || 'pro';
const PLAN_PRICE = Number(process.env.BILLING_PLAN_PRICE || 9.9);
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

  private async createCharge(shopDomain: string, amount: number) {
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
        name: PLAN_CODE,
        returnUrl,
        test: false,
        price: String(amount),
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
  async setBillingShop(shopDomain: string) {
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
      const created = await this.createCharge(shop.shopDomain, PLAN_PRICE);
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
              planCode: PLAN_CODE,
            },
          })
        : await this.prisma.subscription.create({
            data: {
              shopId: shop.id,
              planCode: PLAN_CODE,
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
      const created = await this.createCharge(next.shopDomain, PLAN_PRICE);
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
            planCode: PLAN_CODE,
          },
        });
      } else {
        await this.prisma.subscription.create({
          data: {
            shopId: next.id,
            planCode: PLAN_CODE,
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

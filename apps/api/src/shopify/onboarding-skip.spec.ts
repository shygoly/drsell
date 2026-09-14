import { ShopifyService } from './shopify.service';

jest.mock('@drsell/shopify', () => ({
  shopifyGraphql: jest.fn(),
  verifyShopifyWebhookHmacDetailed: jest.fn(),
}));

/**
 * 非 Shopify 店铺（Medusa DTC 独立站，由 ingest 脚本绑定）不适用 Shopify 式初始化向导
 * （连 Shopify、装主题 app extension、Shopify 计费…都不成立）。故 getOnboardingState 对
 * source!='shopify' 的店直接报 done，OnboardingGuard 不会把商家困在向导里。
 */
function makeSvc(source: string, onboardingStep = '1') {
  const shop = { id: 's1', shopDomain: 'x.example', tenantId: 't1', source };
  const setting = {
    id: 'b1',
    onboardingStep,
    embedLiveAt: null,
    onboardingCompletedAt: null,
    widgetPrimaryColor: '#008060',
    widgetPosition: 'bottom-right',
    welcomeMessage: null,
    syncProductsEnabled: true,
    syncOrdersEnabled: true,
    syncCustomersEnabled: true,
  };
  const prisma = { botSetting: { upsert: jest.fn().mockResolvedValue(setting) } };
  const tenants = { ensureShopTenant: jest.fn().mockResolvedValue(shop) };
  const svc = new ShopifyService(
    prisma as never,
    tenants as never,
    {} as never,
    {} as never,
    { reassign: jest.fn() } as never,
  );
  return { svc };
}

describe('非 Shopify 店铺跳过初始化向导', () => {
  it('source=medusa：即便 onboardingStep=1，也报 done + activated（不触发向导）', async () => {
    const { svc } = makeSvc('medusa', '1');
    const s = await svc.getOnboardingState('drsell-shop.szchada.top');
    expect(s.step).toBe('done');
    expect(s.activated).toBe(true);
  });

  it('source=shopify：按存储的 onboardingStep 返回（照常走向导）', async () => {
    const { svc } = makeSvc('shopify', '1');
    const s = await svc.getOnboardingState('a.myshopify.com');
    expect(s.step).toBe('1');
  });
});

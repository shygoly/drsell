import { ShopifyService } from './shopify.service';
import { shopifyGraphql } from '@drsell/shopify';

jest.mock('@drsell/shopify', () => ({
  shopifyGraphql: jest.fn(),
  verifyShopifyWebhookHmacDetailed: jest.fn(),
}));
const mockedGraphql = shopifyGraphql as jest.Mock;

/**
 * app/uninstalled 会不可逆地销毁一个店的 Admin API 访问（令牌置空，只能靠重装恢复）。
 * 2026-09-09 真实发生过：为验证 webhook 路由，对生产店铺 chatbotdomaintest 发了两条
 * 自签的测试事件，服务端照做，该店当场失去访问。HMAC 合法 ≠ 事实为真。
 */
function makeSvc(opts: { tokenWorks: boolean; hasToken?: boolean }) {
  const shop = { id: 's1', shopDomain: 'a.myshopify.com', tenantId: 't1' };
  const update = jest.fn().mockResolvedValue(shop);
  const prisma = {
    shop: { update },
    subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    knowledgeSyncJob: { create: jest.fn() },
  };
  const tenants = {
    getByShopDomain: jest.fn().mockResolvedValue(shop),
    getValidAccessToken: jest
      .fn()
      .mockResolvedValue(opts.hasToken === false ? null : 'tok'),
  };
  mockedGraphql.mockReset();
  if (opts.tokenWorks) mockedGraphql.mockResolvedValue({ data: { shop: { id: 'gid://shopify/Shop/1' } } });
  else mockedGraphql.mockRejectedValue(new Error('401 Unauthorized'));

  const svc = new ShopifyService(
    prisma as never,
    tenants as never,
    {} as never,
    {} as never,
    { reassign: jest.fn() } as never,
  );
  return { svc, update, prisma, tenants };
}

describe('app/uninstalled 销毁访问权前要有证据', () => {
  it('令牌仍可用 → 判定为不实事件，不动任何数据', async () => {
    const { svc, update, prisma } = makeSvc({ tokenWorks: true });
    const r = await svc.handleUninstall('a.myshopify.com');
    expect(r).toMatchObject({ ok: true, ignored: 'access-still-valid' });
    expect(update).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('令牌已失效（真卸载）→ 照常清理', async () => {
    const { svc, update, prisma } = makeSvc({ tokenWorks: false });
    await svc.handleUninstall('a.myshopify.com');
    expect(update).toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toMatchObject({
      accessToken: null,
      refreshToken: null,
    });
    expect(prisma.session.deleteMany).toHaveBeenCalled();
  });

  it('本来就没有令牌 → 按已失效处理，不因此卡住清理', async () => {
    const { svc, update } = makeSvc({ tokenWorks: false, hasToken: false });
    await svc.handleUninstall('a.myshopify.com');
    expect(update).toHaveBeenCalled();
  });

  it('查询本身抛错（网络/限流）→ 相信 webhook，继续清理', async () => {
    // 问不到不等于「还活着」。真卸载后留一把死令牌，比误清更糟
    const { svc, update } = makeSvc({ tokenWorks: false });
    mockedGraphql.mockRejectedValue(new Error('ECONNRESET'));
    await svc.handleUninstall('a.myshopify.com');
    expect(update).toHaveBeenCalled();
  });

  it('库里没有这个店 → 直接返回，不报错', async () => {
    const { svc, tenants, update } = makeSvc({ tokenWorks: true });
    tenants.getByShopDomain.mockResolvedValue(null);
    await expect(svc.handleUninstall('nope.myshopify.com')).resolves.toEqual({ ok: true });
    expect(update).not.toHaveBeenCalled();
  });
});

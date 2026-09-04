import { buildAdminAppUrl, storeHandleOf } from './onboarding';

describe('storeHandleOf', () => {
  it('剥掉协议、尾斜杠与 .myshopify.com', () => {
    expect(storeHandleOf('https://chatbotdomaintest.myshopify.com/')).toBe(
      'chatbotdomaintest',
    );
    expect(storeHandleOf('chatbotdomaintest.myshopify.com')).toBe(
      'chatbotdomaintest',
    );
  });

  it('大小写不敏感', () => {
    expect(storeHandleOf('Shop.MyShopify.com')).toBe('Shop');
  });
});

describe('buildAdminAppUrl', () => {
  it('装完落在 Admin 内的嵌入应用，而不是站外页面', () => {
    expect(buildAdminAppUrl('chatbotdomaintest.myshopify.com')).toBe(
      'https://admin.shopify.com/store/chatbotdomaintest/apps/drseller-alpha',
    );
  });

  it('绝不指向本服务域名——那正是之前把商家踢出 Admin 的原因', () => {
    expect(buildAdminAppUrl('shop.myshopify.com')).not.toContain('szchada.top');
    expect(buildAdminAppUrl('shop.myshopify.com')).not.toContain('widget-config');
  });
});

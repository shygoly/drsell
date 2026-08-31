import { ForbiddenException } from '@nestjs/common';
import { resolveScopedShopDomain, resolveScopedTenantId } from './shop-scope';
import type { JwtPayload } from '../auth/auth.service';

const shopTok: JwtPayload = {
  typ: 'shop',
  shop: 'a.myshopify.com',
  tenantId: 't1',
  sub: 's1',
};
const adminTok: JwtPayload = { typ: 'admin', role: 'admin', sub: 'u1' };
const superTok: JwtPayload = { typ: 'admin', role: 'superadmin', sub: 'u0' };

describe('resolveScopedShopDomain', () => {
  it('shop 会话无参数时返回绑定店铺', () => {
    expect(resolveScopedShopDomain(shopTok)).toBe('a.myshopify.com');
  });

  it('大小写/协议差异归一化后视为同一家店', () => {
    expect(
      resolveScopedShopDomain(shopTok, 'https://A.myshopify.com/'),
    ).toBe('a.myshopify.com');
  });

  it('shop 会话请求他店被拒', () => {
    expect(() =>
      resolveScopedShopDomain(shopTok, 'victim.myshopify.com'),
    ).toThrow(ForbiddenException);
  });

  it('自助注册的 admin 拿不到任何店铺', () => {
    expect(() =>
      resolveScopedShopDomain(adminTok, 'victim.myshopify.com'),
    ).toThrow(ForbiddenException);
  });

  it('无 token 被拒', () => {
    expect(() =>
      resolveScopedShopDomain(undefined, 'victim.myshopify.com'),
    ).toThrow(ForbiddenException);
  });

  it('superadmin 可显式指定店铺', () => {
    expect(resolveScopedShopDomain(superTok, 'victim.myshopify.com')).toBe(
      'victim.myshopify.com',
    );
  });
});

describe('resolveScopedTenantId', () => {
  it('只认 token 里的租户', () => {
    expect(resolveScopedTenantId(shopTok)).toBe('t1');
    expect(() => resolveScopedTenantId(shopTok, 't2')).toThrow(
      ForbiddenException,
    );
  });

  it('admin 无租户绑定时被拒', () => {
    expect(() => resolveScopedTenantId(adminTok, 't1')).toThrow(
      ForbiddenException,
    );
  });
});

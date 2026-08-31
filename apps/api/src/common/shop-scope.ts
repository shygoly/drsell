import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.service';

export function normalizeShopDomain(value?: string | null): string {
  return (value ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * 请求作用域内唯一的店铺来源。
 *
 * shop 会话（App Bridge session token 换发）只能操作 token 里绑定的那家店；
 * 请求里的 shop 参数只用于比对，不能扩权。
 * admin 会话在 Membership 表落地前不携带任何店铺授权，只有 superadmin 可指定店铺。
 */
export function resolveScopedShopDomain(
  user: JwtPayload | undefined,
  requested?: string,
): string {
  const asked = normalizeShopDomain(requested);

  if (user?.typ === 'shop') {
    const bound = normalizeShopDomain(user.shop);
    if (!bound) throw new ForbiddenException('session has no shop scope');
    if (asked && asked !== bound) {
      throw new ForbiddenException('shop out of session scope');
    }
    return bound;
  }

  if (user?.typ === 'admin' && user.role === 'superadmin') {
    if (!asked) throw new ForbiddenException('shop is required');
    return asked;
  }

  throw new ForbiddenException('session is not bound to a shop');
}

/**
 * tenantId 同理：只认 token 里的租户，superadmin 才能跨租户查询。
 */
export function resolveScopedTenantId(
  user: JwtPayload | undefined,
  requested?: string,
): string {
  const asked = (requested ?? '').trim();

  if (user?.typ === 'admin' && user.role === 'superadmin') {
    if (!asked) throw new ForbiddenException('tenantId is required');
    return asked;
  }

  const bound = user?.tenantId;
  if (!bound) throw new ForbiddenException('session is not bound to a tenant');
  if (asked && asked !== bound) {
    throw new ForbiddenException('tenant out of session scope');
  }
  return bound;
}

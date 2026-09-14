import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 验证 Medusa 顾客 JWT（HS256），用于挂件按顾客隔离（D8）。
 *
 * Medusa v2 `/auth/customer/emailpass` 返回的令牌用 `http.jwtSecret`（HS256）签名，
 * payload 含 `actor_id`（= 顾客 id，与 drsell `Order.customerId`/`Customer.shopifyCustomerId` 对齐）
 * 与 `actor_type: "customer"`。这里用内置 crypto 校验签名+过期+类型，不引第三方依赖。
 *
 * **必须验签**：仅解码不校验＝任何人可伪造 actor_id 冒充他人。密钥来自服务端配置
 * （`MEDUSA_JWT_SECRET`），前端拿不到，故顾客身份不可伪造。
 */
export type MedusaCustomer = { actorId: string };

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

export function verifyMedusaCustomerToken(
  token: string | undefined | null,
  secret: string | undefined | null,
): MedusaCustomer | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  let header: { alg?: string };
  let payload: { actor_id?: unknown; actor_type?: unknown; exp?: unknown };
  try {
    header = JSON.parse(b64urlToBuf(h).toString('utf8'));
    payload = JSON.parse(b64urlToBuf(p).toString('utf8'));
  } catch {
    return null;
  }

  if (header?.alg !== 'HS256') return null;

  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const got = b64urlToBuf(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;

  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return null;
  if (payload.actor_type != null && payload.actor_type !== 'customer') return null;

  const actorId = payload.actor_id;
  if (typeof actorId !== 'string' || actorId.length === 0) return null;
  return { actorId };
}

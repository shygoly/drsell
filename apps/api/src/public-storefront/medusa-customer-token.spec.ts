import { createHmac } from 'node:crypto';
import { verifyMedusaCustomerToken } from './medusa-customer-token';

const SECRET = 'test-medusa-secret';

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function sign(payload: Record<string, unknown>, secret = SECRET, alg = 'HS256'): string {
  const h = b64url({ alg, typ: 'JWT' });
  const p = b64url(payload);
  const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 10;

describe('verifyMedusaCustomerToken', () => {
  it('有效顾客令牌 → 返回 actorId', () => {
    const t = sign({ actor_id: 'cus_123', actor_type: 'customer', exp: future });
    expect(verifyMedusaCustomerToken(t, SECRET)).toEqual({ actorId: 'cus_123' });
  });

  it('签名被篡改 → null', () => {
    const t = sign({ actor_id: 'cus_123', actor_type: 'customer', exp: future });
    const tampered = t.slice(0, -3) + (t.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
    expect(verifyMedusaCustomerToken(tampered, SECRET)).toBeNull();
  });

  it('错误密钥 → null（防伪造）', () => {
    const t = sign({ actor_id: 'cus_evil', actor_type: 'customer', exp: future }, 'attacker-secret');
    expect(verifyMedusaCustomerToken(t, SECRET)).toBeNull();
  });

  it('已过期 → null', () => {
    const t = sign({ actor_id: 'cus_123', actor_type: 'customer', exp: past });
    expect(verifyMedusaCustomerToken(t, SECRET)).toBeNull();
  });

  it('非顾客 actor_type → null', () => {
    const t = sign({ actor_id: 'usr_1', actor_type: 'user', exp: future });
    expect(verifyMedusaCustomerToken(t, SECRET)).toBeNull();
  });

  it('缺 token 或 secret → null', () => {
    expect(verifyMedusaCustomerToken(undefined, SECRET)).toBeNull();
    expect(verifyMedusaCustomerToken(sign({ actor_id: 'c', actor_type: 'customer', exp: future }), undefined)).toBeNull();
  });
});

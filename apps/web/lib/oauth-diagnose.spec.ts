import { createHmac } from 'node:crypto';
import { canonicalQueryForHmac, diagnoseOAuthCallback } from './oauth-diagnose';

const CURRENT = 'shpss_current_secret';
const PREVIOUS = 'shpss_previous_secret';

function signed(secret: string, params: Record<string, string>): URLSearchParams {
  const q = new URLSearchParams(params);
  const hmac = createHmac('sha256', secret).update(canonicalQueryForHmac(q)).digest('hex');
  q.set('hmac', hmac);
  return q;
}

const BASE = {
  shop: 'quickstart-ff760338.myshopify.com',
  code: 'abc123',
  state: 'nonce-1',
  timestamp: '1789000000',
};

describe('OAuth 回调失败定位', () => {
  it('一切正常时两项检查都过', () => {
    const d = diagnoseOAuthCallback({
      query: signed(CURRENT, BASE),
      stateCookie: 'nonce-1',
      secret: CURRENT,
      previousSecret: PREVIOUS,
    });
    expect(d.hmacMatchesCurrent).toBe(true);
    expect(d.stateMatches).toBe(true);
  });

  it('Shopify 用旧密钥签 → 明确指出密钥不一致，而不是含糊的「回调无效」', () => {
    // 这是本 app 已确证的形态：Shopify 仍用旧密钥签 webhook，OAuth 同理不意外
    const d = diagnoseOAuthCallback({
      query: signed(PREVIOUS, BASE),
      stateCookie: 'nonce-1',
      secret: CURRENT,
      previousSecret: PREVIOUS,
    });
    expect(d.hmacMatchesCurrent).toBe(false);
    expect(d.hmacMatchesPrevious).toBe(true);
    expect(d.likelyCause).toMatch(/旧密钥/);
  });

  it('两把都对不上 → 密钥根本不属于这个 app', () => {
    const d = diagnoseOAuthCallback({
      query: signed('some-third-secret', BASE),
      stateCookie: 'nonce-1',
      secret: CURRENT,
      previousSecret: PREVIOUS,
    });
    expect(d.hmacMatchesCurrent).toBe(false);
    expect(d.hmacMatchesPrevious).toBe(false);
    expect(d.likelyCause).toMatch(/都对不上/);
  });

  it('HMAC 对但 cookie 没了 → 说清是 60 秒过期，不要误导成密钥问题', () => {
    const d = diagnoseOAuthCallback({
      query: signed(CURRENT, BASE),
      stateCookie: null,
      secret: CURRENT,
      previousSecret: PREVIOUS,
    });
    expect(d.hmacMatchesCurrent).toBe(true);
    expect(d.likelyCause).toMatch(/60 秒|cookie/);
  });

  it('HMAC 对但 state 不一致 → 指向并发的授权流程', () => {
    const d = diagnoseOAuthCallback({
      query: signed(CURRENT, BASE),
      stateCookie: 'nonce-OTHER',
      secret: CURRENT,
      previousSecret: PREVIOUS,
    });
    expect(d.stateMatches).toBe(false);
    expect(d.likelyCause).toMatch(/state/);
  });

  it('没有 hmac → 根本不是 Shopify 发来的', () => {
    const d = diagnoseOAuthCallback({
      query: new URLSearchParams(BASE),
      stateCookie: 'nonce-1',
      secret: CURRENT,
      previousSecret: PREVIOUS,
    });
    expect(d.hmacPresent).toBe(false);
    expect(d.likelyCause).toMatch(/不是 Shopify/);
  });

  it('规范化：剔除 hmac/signature、按键排序、+ 转 %20', () => {
    const q = new URLSearchParams({
      hmac: 'X',
      signature: 'Y',
      shop: 'a.myshopify.com',
      code: 'c d',
      state: 'z',
    });
    const s = canonicalQueryForHmac(q);
    expect(s).not.toMatch(/hmac|signature/);
    expect(s).toBe('code=c%20d&shop=a.myshopify.com&state=z');
  });

  it('没配 previous 时不误报为「旧密钥问题」', () => {
    const d = diagnoseOAuthCallback({
      query: signed('other', BASE),
      stateCookie: 'nonce-1',
      secret: CURRENT,
      previousSecret: null,
    });
    expect(d.hmacMatchesPrevious).toBeNull();
    expect(d.likelyCause).toMatch(/都对不上/);
  });
});

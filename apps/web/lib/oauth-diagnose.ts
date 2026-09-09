import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * OAuth 回调失败的定位。
 *
 * 为什么需要：`shopify.auth.callback()` 失败只抛一句 `Invalid OAuth callback.`，
 * 而它其实是两个独立检查的与——query 的 HMAC、以及 state 与 cookie 是否一致
 * （见 @shopify/shopify-api 的 validQuery）。分不清是哪一个坏，就只能猜。
 * 商家那头看到的也只是这句话，装不上却不知道该做什么。
 *
 * 特别要分清**是不是密钥轮换没收尾**：本 app 已确证 Shopify 仍在用旧密钥签
 * webhook（2026-09-09 实测 app/scopes_update）。若 OAuth 回调同理，用当前密钥
 * 算 HMAC 必然对不上，而这与「链接过期」「state 不匹配」的处置完全不同。
 */
export type OAuthDiagnosis = {
  hmacPresent: boolean;
  hmacMatchesCurrent: boolean;
  hmacMatchesPrevious: boolean | null;
  statePresentInQuery: boolean;
  stateCookiePresent: boolean;
  stateMatches: boolean;
  /** 一句人话，直接可放进给商家的报错里。 */
  likelyCause: string;
};

/** 复刻 @shopify/shopify-api 的 stringifyQueryForAdmin：去掉 hmac/signature，按键排序，+ 转 %20。 */
export function canonicalQueryForHmac(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hmac' || k === 'signature') continue;
    entries.push([k, v]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  const out = new URLSearchParams();
  for (const [k, v] of entries) out.append(k, v);
  return out.toString().replace(/\+/g, '%20');
}

function hmacMatches(secret: string, message: string, expectedHex: string): boolean {
  if (!secret || !expectedHex) return false;
  const local = createHmac('sha256', secret).update(message).digest('hex');
  // 长度不等时 timingSafeEqual 会抛，先挡掉
  if (local.length !== expectedHex.length) return false;
  return timingSafeEqual(Buffer.from(local), Buffer.from(expectedHex));
}

export function diagnoseOAuthCallback(args: {
  query: URLSearchParams;
  stateCookie: string | null;
  secret: string;
  previousSecret?: string | null;
}): OAuthDiagnosis {
  const { query, stateCookie, secret, previousSecret } = args;
  const hmac = query.get('hmac');
  const stateInQuery = query.get('state');
  const message = canonicalQueryForHmac(query);

  const hmacMatchesCurrent = Boolean(hmac) && hmacMatches(secret, message, hmac as string);
  const hmacMatchesPrevious = previousSecret
    ? Boolean(hmac) && hmacMatches(previousSecret, message, hmac as string)
    : null;
  const stateMatches = Boolean(stateInQuery) && stateInQuery === stateCookie;

  let likelyCause: string;
  if (!hmac) {
    likelyCause = '回调 URL 里没有 hmac —— 这不是 Shopify 发来的请求';
  } else if (hmacMatchesPrevious && !hmacMatchesCurrent) {
    likelyCause =
      'Shopify 用**旧密钥**签了这次回调：SHOPIFY_API_SECRET 与 Shopify 后台当前的 ' +
      'Client secret 不一致。改 SHOPIFY_API_SECRET 为 Shopify 后台那把，OAuth 才能通';
  } else if (!hmacMatchesCurrent) {
    likelyCause =
      'HMAC 用当前与历史密钥都对不上 —— 密钥不属于这个 app，或回调 URL 被改动过';
  } else if (!stateCookie) {
    likelyCause =
      'HMAC 正确但 state cookie 不在：授权页停留超过 60 秒（cookie 只活 60 秒），或浏览器拦了第三方 cookie。重新发起一次即可';
  } else if (!stateMatches) {
    likelyCause =
      'HMAC 正确但 state 与 cookie 不一致：多个授权流程互相覆盖了 cookie。关掉其他标签页重发起一次';
  } else {
    likelyCause = '两项检查都通过 —— 失败原因在别处';
  }

  return {
    hmacPresent: Boolean(hmac),
    hmacMatchesCurrent,
    hmacMatchesPrevious,
    statePresentInQuery: Boolean(stateInQuery),
    stateCookiePresent: Boolean(stateCookie),
    stateMatches,
    likelyCause,
  };
}

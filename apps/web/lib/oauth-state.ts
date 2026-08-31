import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'v1.';
const INSTALL_WINDOW_MS = 10 * 60 * 1000;

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/**
 * 把发起安装的 admin JWT 密封进 HttpOnly cookie：
 * `v1.<base64url(jwt)>.<expMs>.<hmac>`，用 SHOPIFY_API_SECRET 做 HMAC。
 * 不把 userId 明文放进 state，回调端验签后取回 JWT 交给 API 校验并落归属。
 */
export function sealInstallUserToken(
  userToken: string,
  secret: string,
  now = Date.now(),
): string {
  const exp = now + INSTALL_WINDOW_MS;
  const payload = `${b64url(userToken)}.${exp}`;
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${PREFIX}${payload}.${mac}`;
}

/** 验签 + 10 分钟窗口校验，成功返回原始 admin JWT，失败返回 null */
export function unsealInstallUserToken(
  sealed: string | null | undefined,
  secret: string,
  now = Date.now(),
): string | null {
  if (!sealed || !sealed.startsWith(PREFIX)) return null;
  const body = sealed.slice(PREFIX.length);
  const macSep = body.lastIndexOf('.');
  if (macSep <= 0) return null;
  const payload = body.slice(0, macSep);
  const mac = body.slice(macSep + 1);

  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expSep = payload.lastIndexOf('.');
  const exp = Number(payload.slice(expSep + 1));
  if (!Number.isFinite(exp) || exp <= now) return null;

  return Buffer.from(payload.slice(0, expSep), 'base64url').toString('utf8');
}

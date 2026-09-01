const TOKEN_KEY = 'ops_token';
export const OPS_TOKEN_COOKIE = 'ops_token';

export type JwtPayload = {
  exp?: number;
  role?: string;
  typ?: string;
};

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as JwtPayload;
  } catch {
    return null;
  }
}

/** Edge-safe: returns false when exp is missing or past. */
export function isTokenValid(token: string | null | undefined): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 > Date.now();
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function cookieMaxAge(token: string): number {
  const payload = decodeJwtPayload(token);
  if (payload?.exp) {
    return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
  }
  return 7 * 86400;
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${OPS_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${cookieMaxAge(token)}; SameSite=Lax${secure}`;
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  if (typeof document === 'undefined') return;
  document.cookie = `${OPS_TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api';
export const MERCHANT_APP_URL =
  process.env.NEXT_PUBLIC_MERCHANT_URL ?? 'https://drsell.szchada.top';

export { clearToken, getToken, setToken } from '@/lib/auth';
import { clearToken, getToken } from '@/lib/auth';

export async function opsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401 || res.status === 403) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type QueueItem = {
  shopDomain: string;
  status: string;
  ownerEmail: string | null;
  daysRemaining: number;
  queueKind: 'trial' | 'period' | 'unfreeze';
  windowStart: string;
  windowEnd: string;
};

export type AccountSummary = {
  id: string;
  email: string;
  role: string;
  createdAt?: string;
  authProvider?: string;
  lastLoginAt?: string | null;
  totalShops?: number;
  totalMonthlyBillUsd?: number;
  shops: Array<{
    shopDomain: string;
    role: string;
    status?: string;
    isBillingShop: boolean;
    installedAt?: string;
  }>;
  auditPreview?: AuditPreviewRow[];
};

export type AuditPreviewRow = {
  id: string;
  actorEmail: string;
  action: string;
  shopDomain: string | null;
  result: string;
  createdAt: string;
};

export type ShopDetail = {
  shopDomain: string;
  status: string;
  trialEnds: string | null;
  currentPeriodEnd: string | null;
  unfreezeBy: string | null;
  frozenAt: string | null;
  isBillingShop: boolean;
  chatCount: number | null;
  chatLimit: number;
  aiResolved: number;
  aiResolvedLimit: number;
  agentSeats: number;
  agentSeatsLimit: number;
  overQuotaNote: string | null;
  widgetVisible?: boolean;
  ownerEmail?: string | null;
  accountShopCount?: number | null;
  installedAt?: string | null;
  planCode?: string;
  planName?: string;
  planPriceUsd?: number;
  shopifyChargeId?: string | null;
  lastSuccessfulChargeAt?: string | null;
  periodStart?: string | null;
  scopes?: string[];
};

export type AuditLogRow = {
  id: string;
  actorEmail: string;
  action: string;
  shopDomain: string | null;
  result: string;
  ip: string | null;
  createdAt: string;
};

export type AuditLogPage = {
  items: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
};

export type OpsPlan = {
  code: string;
  displayName: string;
  priceUsd: number;
  chatLimit: number;
  aiResolvedLimit: number;
  seatLimit: number;
  aiOverageUsd: number;
  trialDays: number;
};

export type ImpersonateResult = {
  accessToken: string;
  expiresIn: number;
  shopDomain: string;
  banner: string;
};

const ACTION_LABELS: Record<string, string> = {
  'shop.dunning': '发催缴提醒',
  'shop.extend_freeze': '延长解冻期',
  'shop.billing_shop': '改指定计费店',
  'shop.resync': '重跑同步',
  'shop.impersonate': '代登录',
  'shop.disable_widget': '停用聊天窗',
  'shop.enable_widget': '恢复聊天窗',
};

export function formatAuditAction(action: string) {
  return ACTION_LABELS[action] ?? action;
}

export function openImpersonationSession(result: ImpersonateResult) {
  // Stitch 屏 07：先进入运营台内的 Active Support Session 视图，
  // 由该视图再打开商户端外部窗口。内部视图保留会话上下文与审计轨迹。
  const url = new URL('/impersonation', window.location.origin);
  url.searchParams.set('shop', result.shopDomain);
  url.searchParams.set('token', result.accessToken);
  url.searchParams.set('expiresIn', String(result.expiresIn));
  window.location.href = url.toString();
}

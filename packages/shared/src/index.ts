export type ApiErrorBody = {
  code: string;
  message: string;
  requestId?: string;
};

export type TenantContext = {
  tenantId: string;
  shop: string;
};

export type ShopBotSetting = {
  id: string;
  shopId: string;
  shopName: string;
  botId?: string | null;
  adpAppKey?: string | null;
  chatLogo?: string | null;
  chatAvatar?: string | null;
};

export type OnboardingStep = '1' | '2' | '3' | '5' | 'done';

export type OnboardingState = {
  step: OnboardingStep;
  embedLiveAt: string | null;
  onboardingCompletedAt: string | null;
  widgetPrimaryColor: string;
  widgetPosition: 'bottom-right' | 'bottom-left';
  welcomeMessage: string | null;
  syncProductsEnabled: boolean;
  syncOrdersEnabled: boolean;
  syncCustomersEnabled: boolean;
  activated: boolean;
};

export type SyncStatus = {
  products: { status: string; count?: number };
  orders: { status: string; count?: number };
  customers: { status: string; count?: number };
};

export type InboxUser = {
  id: string;
  shopId: string;
  userEmail: string;
  displayName?: string | null;
};

export type ProductRecord = {
  id: string;
  tenantId: string;
  shopifyProductId: string;
  name: string;
  price?: string | null;
  description?: string | null;
  category?: string | null;
  stock?: number | null;
};

export type OrderRecord = {
  id: string;
  tenantId: string;
  shopifyOrderId: string;
  customerId?: string | null;
  status?: string | null;
  total: string;
  shopifyCreatedAt?: string | null;
};

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  UPSTREAM: 'UPSTREAM',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * 套餐与配额 —— 定价的唯一事实来源。
 *
 * 计数单位是「一次成功的 AI 回答」：OpenClaw 真的产出了内容才计。请求失败、
 * 超额拦截、商家在 Inbox 里人工回复，都不计入。
 *
 * 改这里之前先想清楚：listing 上写的价格与额度必须与本表一致，
 * 描述与实际计费不符是 Shopify 的驳回项。
 */
export type PlanCode = 'basic' | 'pro';

export type PlanDefinition = {
  code: PlanCode;
  /** 展示名，与 App Store listing 的 Display name 一致 */
  name: string;
  /** 每 30 天周期价格（USD） */
  price: number;
  /** 每个计费周期可用的 AI 回答次数 */
  answersPerPeriod: number;
};

export const PLANS: Record<PlanCode, PlanDefinition> = {
  basic: { code: 'basic', name: 'Basic', price: 15, answersPerPeriod: 1500 },
  pro: { code: 'pro', name: 'Pro', price: 30, answersPerPeriod: 5000 },
};

export const DEFAULT_PLAN: PlanCode = 'basic';

export function planOf(code: string | null | undefined): PlanDefinition {
  return PLANS[(code || '') as PlanCode] ?? PLANS[DEFAULT_PLAN];
}

/** 配额用量，供商家端展示与超额判断 */
export type AiQuotaUsage = {
  planCode: PlanCode;
  planName: string;
  /** 本周期已用的 AI 回答次数 */
  used: number;
  /** 本周期额度 */
  limit: number;
  /** 剩余；已超额时为 0 */
  remaining: number;
  /** 周期起止（ISO） */
  periodStart: string;
  periodEnd: string;
  /** 是否已用尽 */
  exhausted: boolean;
};

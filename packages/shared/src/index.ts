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

import { merchantFetch } from "./merchant-api";

export type OnboardingStep = "1" | "2" | "3" | "5" | "done";

export type OnboardingState = {
  step: OnboardingStep;
  embedLiveAt: string | null;
  onboardingCompletedAt: string | null;
  widgetPrimaryColor: string;
  widgetPosition: "bottom-right" | "bottom-left";
  welcomeMessage: string | null;
  syncProductsEnabled: boolean;
  syncOrdersEnabled: boolean;
  syncCustomersEnabled: boolean;
  activated: boolean;
};

export type SyncKindStatus = { status: string; count?: number };

export type SyncStatus = {
  products: SyncKindStatus;
  orders: SyncKindStatus;
  customers: SyncKindStatus;
};

export const EXTENSION_HANDLE = "drsell-chat";
/** Liquid block filename (without .liquid) — required by activateAppId deep links */
export const EMBED_BLOCK_HANDLE = "chat-embed";
export const CLIENT_ID =
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ||
  "0b36b70772220b71b2fe296b3deba914";

/** HTTPS Admin deep link that opens the theme editor focused on our app embed. */
export function buildEmbedDeepLink(
  shop: string,
  clientId = CLIENT_ID,
  handle = EMBED_BLOCK_HANDLE,
) {
  const domain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const storeHandle = domain.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps&activateAppId=${clientId}/${handle}`;
}

/** Top-level navigation so the button works inside the Shopify Admin iframe. */
export function openEmbedDeepLink(shop: string) {
  if (!shop || typeof window === "undefined") return;
  const url = buildEmbedDeepLink(shop);
  const target = window.top ?? window;
  target.location.assign(url);
}

export function fetchOnboarding(shop: string, token: string) {
  return merchantFetch<OnboardingState>(
    `/shopify/onboarding?shop=${encodeURIComponent(shop)}`,
    token,
  );
}

export function patchOnboarding(
  shop: string,
  token: string,
  body: Record<string, unknown>,
) {
  return merchantFetch<OnboardingState>(
    `/shopify/onboarding?shop=${encodeURIComponent(shop)}`,
    token,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function startBatchSync(shop: string, token: string) {
  return merchantFetch<{ started: string[] }>(
    `/shopify/sync/batch?shop=${encodeURIComponent(shop)}`,
    token,
    { method: "POST" },
  );
}

export function fetchSyncStatus(shop: string, token: string) {
  return merchantFetch<SyncStatus>(
    `/shopify/sync/status?shop=${encodeURIComponent(shop)}`,
    token,
  );
}

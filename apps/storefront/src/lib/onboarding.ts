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

/** app handle，用于托管计费的套餐选择页深链（与 shopify.app.toml 的 handle 一致）。 */
export const APP_HANDLE = "drseller-alpha";

/**
 * Shopify 托管计费的套餐选择页。
 *
 * 本 app 开的是 App Pricing（托管计费），商家在 **Shopify 自己的界面**选套餐，
 * 不经过我们的 createCharge。所以「去选套餐」必须给出这个链接——
 * 2026-09-09 之前商家端只有一句 "Choose a plan in Shopify" 而没有出口，是条死路。
 */
export function buildPricingPlansLink(shop: string, handle = APP_HANDLE) {
  const storeHandle = shop
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${handle}/pricing_plans`;
}

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

/**
 * 在**新标签页**打开主题编辑器深链。
 *
 * 原实现走 `window.top.location.assign`，等于把整个 Shopify admin 导航走——
 * 商家丢失应用现场，也就回不来点旁边那个「我已启用」按钮，而这一步正是引导流程
 * 的下一环。启用主题嵌入本来就是「去别处做一件事再回来」，新标签页才是对的形状。
 *
 * 弹窗被拦时退回顶层跳转：宁可导航走，也好过点了没反应。
 * 返回值说明实际走了哪条路，便于测试与埋点。
 */
export function openEmbedDeepLink(
  shop: string,
  win: Pick<Window, "open"> & { top?: unknown } = typeof window === "undefined"
    ? ({ open: () => null } as never)
    : window,
): "new-tab" | "top-navigation" | "noop" {
  if (!shop) return "noop";
  const url = buildEmbedDeepLink(shop);
  let opened: unknown = null;
  try {
    opened = win.open(url, "_blank", "noopener,noreferrer");
  } catch {
    opened = null; // 沙箱 iframe 未授予 allow-popups 时会抛
  }
  if (opened) return "new-tab";
  const top = (win as { top?: { location?: { assign?: (u: string) => void } } }).top ?? win;
  (top as { location?: { assign?: (u: string) => void } })?.location?.assign?.(url);
  return "top-navigation";
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

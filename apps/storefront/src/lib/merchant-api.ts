const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function merchantFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  // 仅在有请求体时设置 Content-Type，避免 GET 触发 CORS 预检
  // （Shopify Admin iframe 内某些环境会把请求视为跨域）。
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type BotSettingRecord = {
  id: string;
  shopName: string | null;
  widgetPrimaryColor: string | null;
  widgetPosition: string | null;
  welcomeMessage: string | null;
};

export async function fetchBotSettings(shop: string, token: string) {
  return merchantFetch<BotSettingRecord>(
    `/shopify/botSettings/shop/${encodeURIComponent(shop)}`,
    token,
  );
}

export async function saveBotSettings(
  shop: string,
  token: string,
  data: {
    shopName?: string;
    widgetPrimaryColor?: string;
    widgetPosition?: string;
    welcomeMessage?: string;
  },
) {
  return merchantFetch<BotSettingRecord>(
    `/shopify/botSettings/shop/${encodeURIComponent(shop)}`,
    token,
    { method: "PUT", body: JSON.stringify(data) },
  );
}

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
  widgetHeaderColor: string | null;
  widgetPosition: string | null;
  widgetWindowSize: string | null;
  widgetLauncherStyle: string | null;
  widgetVisible: boolean | null;
  widgetQuickReplies: string[] | null;
  welcomeMessage: string | null;
  aiEnabled: boolean | null;
  aiPersonaName: string | null;
  aiTone: string | null;
  aiLanguage: string | null;
  aiSystemPrompt: string | null;
};

/** AI Assistant 人设草稿，用于保存与沙盒预览。language 为 "auto"|"en"|"zh-Hans"|"es"。 */
export type AiPersonaDraft = {
  aiEnabled?: boolean;
  aiPersonaName?: string;
  aiTone?: string;
  aiLanguage?: string;
  aiSystemPrompt?: string;
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
    widgetHeaderColor?: string;
    widgetPosition?: string;
    widgetWindowSize?: string;
    widgetLauncherStyle?: string;
    widgetVisible?: boolean;
    widgetQuickReplies?: string[];
    welcomeMessage?: string;
  } & AiPersonaDraft,
) {
  return merchantFetch<BotSettingRecord>(
    `/shopify/botSettings/shop/${encodeURIComponent(shop)}`,
    token,
    { method: "PUT", body: JSON.stringify(data) },
  );
}

/** AI Assistant 沙盒：用草稿人设试聊一次。店铺域由服务端按会话校验，这里带上仅作请求作用域。 */
export async function previewAi(
  shop: string,
  token: string,
  draft: AiPersonaDraft & { message: string },
) {
  return merchantFetch<{ reply: string }>(`/shopify/ai/preview`, token, {
    method: "POST",
    body: JSON.stringify({ shopDomain: shop, ...draft }),
  });
}

import { merchantFetch } from "./merchant-api";
import type {
  ChartPoint,
  ChatMessage,
  Conversation,
  ConversationStatus,
  DashboardStats,
  KnowledgeBaseSuggestion,
} from "./types";

/**
 * API 客户端 — 对接 NestJS storefront dashboard 模块。
 *
 * 全部请求都带会话 token：店铺范围由后端从 token 解析（见 apps/api/src/common/shop-scope.ts），
 * 前端不再传 shop 参数，也不再有「拿不到数据就显示种子数据」的兜底——
 * 未授权就应当看到空态，而不是别人的或编造的数字。
 */

/** 未加载/无会话时的零值，避免 UI 渲染出不存在的业务数字 */
export const EMPTY_STATS: DashboardStats = {
  conversationsToday: 0,
  conversationsTrendPct: 0,
  aiResolution: null,
  aiResolutionTarget: 70,
  avgFirstResponseSec: null,
  pendingTakeover: 0,
  windowDays: 30,
  subscription: {
    status: null,
    planCode: null,
    serviceable: true,
    reason: "active",
    trialEndsAt: null,
    periodEndsAt: null,
    graceEndsAt: null,
  },
};

/**
 * 每个请求都带上当前店铺域。
 *
 * 服务端 `resolveShopDomain` 早就有这道闸门：shop 会话里 `asked !== bound` 直接
 * ForbiddenException。但前端一直不传 shop，`asked` 恒为 undefined，闸门从没被
 * 触发过——于是「拿着 A 店的 token 打开 B 店」会静默返回 A 的数据，而不是被拒。
 * 传上之后，同类问题从「悄悄给错数据」变成「403 硬拒」。
 */
function withShop(path: string, shop: string) {
  if (!shop) return path;
  return `${path}${path.includes("?") ? "&" : "?"}shop=${encodeURIComponent(shop)}`;
}

export function fetchStats(token: string, shop = "") {
  return merchantFetch<DashboardStats>(withShop("/storefront/stats", shop), token);
}

export function fetchChart(token: string, shop = "") {
  return merchantFetch<ChartPoint[]>(withShop("/storefront/chart", shop), token);
}

export function fetchConversations(token: string, shop = "") {
  return merchantFetch<Conversation[]>(withShop("/storefront/conversations", shop), token);
}

export function fetchSuggestion(token: string, shop = "") {
  return merchantFetch<KnowledgeBaseSuggestion>(withShop("/storefront/suggestion", shop), token);
}

export function fetchThreadMessages(threadId: string, token: string, shop = "") {
  return merchantFetch<ChatMessage[]>(
    withShop(`/storefront/inbox/${encodeURIComponent(threadId)}/messages`, shop),
    token,
  );
}

/**
 * 人工接管。以前这三个动作只改前端 state——刷新页面就没了，
 * 商家的消息也从未离开过浏览器。
 */
export function takeOverThread(threadId: string, token: string, shop = "") {
  return merchantFetch<{ id: string; status: ConversationStatus }>(
    withShop(`/storefront/inbox/${encodeURIComponent(threadId)}/takeover`, shop),
    token,
    { method: "POST" },
  );
}

export function replyToThread(threadId: string, token: string, text: string, shop = "") {
  return merchantFetch<ChatMessage & { threadStatus: ConversationStatus }>(
    withShop(`/storefront/inbox/${encodeURIComponent(threadId)}/reply`, shop),
    token,
    { method: "POST", body: JSON.stringify({ text }) },
  );
}

export function closeThread(threadId: string, token: string, shop = "") {
  return merchantFetch<{ id: string; status: ConversationStatus }>(
    withShop(`/storefront/inbox/${encodeURIComponent(threadId)}/close`, shop),
    token,
    { method: "POST" },
  );
}

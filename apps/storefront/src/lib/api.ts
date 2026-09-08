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
};

export function fetchStats(token: string) {
  return merchantFetch<DashboardStats>("/storefront/stats", token);
}

export function fetchChart(token: string) {
  return merchantFetch<ChartPoint[]>("/storefront/chart", token);
}

export function fetchConversations(token: string) {
  return merchantFetch<Conversation[]>("/storefront/conversations", token);
}

export function fetchSuggestion(token: string) {
  return merchantFetch<KnowledgeBaseSuggestion>("/storefront/suggestion", token);
}

export function fetchThreadMessages(threadId: string, token: string) {
  return merchantFetch<ChatMessage[]>(
    `/storefront/inbox/${encodeURIComponent(threadId)}/messages`,
    token,
  );
}

/**
 * 人工接管。以前这三个动作只改前端 state——刷新页面就没了，
 * 商家的消息也从未离开过浏览器。
 */
export function takeOverThread(threadId: string, token: string) {
  return merchantFetch<{ id: string; status: ConversationStatus }>(
    `/storefront/inbox/${encodeURIComponent(threadId)}/takeover`,
    token,
    { method: "POST" },
  );
}

export function replyToThread(threadId: string, token: string, text: string) {
  return merchantFetch<ChatMessage & { threadStatus: ConversationStatus }>(
    `/storefront/inbox/${encodeURIComponent(threadId)}/reply`,
    token,
    { method: "POST", body: JSON.stringify({ text }) },
  );
}

export function closeThread(threadId: string, token: string) {
  return merchantFetch<{ id: string; status: ConversationStatus }>(
    `/storefront/inbox/${encodeURIComponent(threadId)}/close`,
    token,
    { method: "POST" },
  );
}

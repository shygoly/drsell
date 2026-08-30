import type {
  ChartPoint,
  ChatMessage,
  Conversation,
  DashboardStats,
  KnowledgeBaseSuggestion,
} from "./types";

/**
 * API 客户端 — 对接 NestJS storefront dashboard 模块。
 * API 不可达时回退到内置种子数据（仅开发演示）；生产空库返回真实空数组。
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

const DEFAULT_SHOP = process.env.NEXT_PUBLIC_DEFAULT_SHOP?.trim() ?? "";

function shopQuery(): string {
  return DEFAULT_SHOP ? `?shop=${encodeURIComponent(DEFAULT_SHOP)}` : "";
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function getJsonNoFallback<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const FALLBACK_STATS: DashboardStats = {
  conversationsToday: 42,
  conversationsTrendPct: 12,
  aiResolution: 68,
  aiResolutionTarget: 70,
  avgFirstResponseSec: 12,
  avgResponseTrendSec: 2,
  pendingTakeover: 3,
};

export const FALLBACK_CHART: ChartPoint[] = [
  { label: "8/1", ai: 40, human: 10 },
  { label: "8/6", ai: 55, human: 15 },
  { label: "8/11", ai: 45, human: 20 },
  { label: "8/16", ai: 70, human: 5 },
  { label: "8/21", ai: 60, human: 25 },
  { label: "8/26", ai: 80, human: 10 },
  { label: "8/29", ai: 90, human: 5 },
];

export const FALLBACK_CONVERSATIONS: Conversation[] = [];

export const FALLBACK_SUGGESTION: KnowledgeBaseSuggestion = {
  title: "Knowledge Base Optimization",
  description:
    "Add 3 missing articles about international shipping to reduce human takeover by ~15%.",
  impact: "-15% takeovers",
};

const q = shopQuery();

export async function fetchStats() {
  return getJson<DashboardStats>(`/storefront/stats${q}`, FALLBACK_STATS);
}

export async function fetchChart() {
  return getJson<ChartPoint[]>(`/storefront/chart${q}`, FALLBACK_CHART);
}

export async function fetchConversations() {
  return getJson<Conversation[]>(
    `/storefront/conversations${q}`,
    FALLBACK_CONVERSATIONS,
  );
}

export async function fetchSuggestion() {
  return getJson<KnowledgeBaseSuggestion>(
    `/storefront/suggestion${q}`,
    FALLBACK_SUGGESTION,
  );
}

export async function fetchThreadMessages(threadId: string) {
  const suffix = DEFAULT_SHOP
    ? `?shop=${encodeURIComponent(DEFAULT_SHOP)}`
    : "";
  return getJsonNoFallback<ChatMessage[]>(
    `/storefront/inbox/${threadId}/messages${suffix}`,
  );
}

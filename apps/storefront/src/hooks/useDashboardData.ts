"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_STATS,
  fetchChart,
  fetchConversations,
  fetchStats,
  fetchSuggestion,
} from "@/lib/api";
import type {
  ChartPoint,
  Conversation,
  DashboardStats,
  KnowledgeBaseSuggestion,
} from "@/lib/types";
import { useShopSession } from "./useShopSession";

type DashboardData = {
  stats: DashboardStats;
  chart: ChartPoint[];
  conversations: Conversation[];
  suggestion: KnowledgeBaseSuggestion | null;
  loading: boolean;
  error: string;
};

/**
 * 仪表盘数据 — 客户端拉取，带会话 token。
 * 服务端渲染时没有任何身份，所以数据不能在 server component 里取（那正是匿名访客
 * 能看到真实会话数据的原因）。
 */
export function useDashboardData(): DashboardData {
  const { token, ready } = useShopSession();
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [suggestion, setSuggestion] = useState<KnowledgeBaseSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      fetchStats(token),
      fetchChart(token),
      fetchConversations(token),
      fetchSuggestion(token),
    ])
      .then(([s, c, conv, sug]) => {
        if (cancelled) return;
        setStats(s);
        setChart(c);
        setConversations(conv);
        setSuggestion(sug);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  return { stats, chart, conversations, suggestion, loading, error };
}

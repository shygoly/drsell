"use client";

import { Headset, MessagesSquare, Timer, Bot } from "lucide-react";
import { SubscriptionBanner } from "@/components/business/subscription-banner";
import { ConversationChart } from "@/components/business/conversation-chart";
import { KnowledgeBaseCard } from "@/components/business/knowledge-base-card";
import { LiveConversations } from "@/components/business/live-conversations";
import { StatCard } from "@/components/business/stat-card";
import { StatusBanner } from "@/components/business/status-banner";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useShopSession } from "@/hooks/useShopSession";
import { useEffect, useRef } from "react";
import { syncSubscription } from "@/lib/onboarding";

export default function DashboardPage() {
  const { stats, chart, conversations, suggestion, error } = useDashboardData();
  const { shop, token } = useShopSession();

  /**
   * 商家从 Shopify 套餐页选完套餐会被重定向回这里，URL 带 `plan_handle` 与
   * `charge_id`。这是唯一「刚刚变了」的确定信号（`app_subscriptions/update`
   * 自 2026-04-28 起已停发），落地就同步一次，否则页面会告诉刚付过钱的商家
   * 「没有有效套餐」。
   *
   * **必须先把参数从 URL 上摘掉再做任何事。** 初版是「同步完 reload」，
   * 而 reload 之后参数还在，于是又同步又 reload——生产上整页无限闪动
   * （2026-09-09）。摘参数放在最前面，即使后面每一步都失败也不会成环。
   *
   * 三重防护：sessionStorage 记住这笔 charge 已处理（跨 reload 有效）；
   * replaceState 摘掉参数；ref 挡住同一次挂载内的重入。
   */
  const handledRef = useRef(false);
  useEffect(() => {
    if (!shop || !token || typeof window === "undefined" || handledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const planHandle = params.get("plan_handle");
    if (!planHandle) return;
    handledRef.current = true;

    const key = `drsell_plan_synced_${params.get("charge_id") ?? planHandle}`;
    let already = false;
    try {
      already = window.sessionStorage.getItem(key) === "1";
      window.sessionStorage.setItem(key, "1");
    } catch {
      // 隐私模式下 sessionStorage 会抛；靠下面摘参数兜底
    }

    // 先摘参数，再做别的。摘掉之后即便 reload 也不会再进这个分支。
    const url = new URL(window.location.href);
    url.searchParams.delete("plan_handle");
    url.searchParams.delete("charge_id");
    try {
      window.history.replaceState({}, "", url.toString());
    } catch {
      // 嵌入 iframe 里极端情况下可能被拒；sessionStorage 已经挡住了重复
    }
    if (already) return;

    void syncSubscription(shop, token)
      .then(() => window.location.reload())
      .catch(() => undefined); // 同步失败不打断商家；陈旧度补同步会兜住
  }, [shop, token]);

  return (
    <div className="flex flex-col gap-6">
      {/* 状态条紧贴顶栏、通栏满宽；用负外边距抵消 AppShell <main> 的 p-6 */}
      <div className="-mx-6 -mt-6">
        <StatusBanner stats={stats} />
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm">
          无法加载数据：{error}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h1 className="text-accent-deep text-display-lg font-bold">Overview</h1>
        <select
          aria-label="Time range"
          className="border-input bg-card focus:border-ring focus:ring-ring/20 h-9 rounded-lg border px-3 text-sm outline-none focus:ring-2"
          defaultValue="Today"
        >
          <option>Today</option>
          <option>Last 7 days</option>
          <option>Last 30 days</option>
        </select>
      </div>

      <SubscriptionBanner state={stats.subscription} shop={shop} />

      {/* 4 指标卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<MessagesSquare className="h-4 w-4" aria-hidden="true" />}
          label={"Today's conversations"}
          value={String(stats.conversationsToday)}
          delta={{ text: `${stats.conversationsTrendPct}%`, good: true }}
        />
        {/* null = 窗口内没有数据。显示 — 而不是 0%——0% 会被读成「AI 一个都没解决」。 */}
        <StatCard
          icon={<Bot className="h-4 w-4" aria-hidden="true" />}
          label={`AI resolution (${stats.windowDays}d)`}
          value={stats.aiResolution === null ? "—" : `${stats.aiResolution}%`}
          delta={{ text: `Target: ${stats.aiResolutionTarget}%`, good: false }}
        />
        <StatCard
          icon={<Timer className="h-4 w-4" aria-hidden="true" />}
          label="Avg first response"
          value={
            stats.avgFirstResponseSec === null ? "—" : `${stats.avgFirstResponseSec}s`
          }
          delta={{ text: `Last ${stats.windowDays}d`, good: true }}
        />
        <StatCard
          icon={<Headset className="h-4 w-4" aria-hidden="true" />}
          label="Pending takeover"
          value={String(stats.pendingTakeover)}
          alert="Action needed"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 稿中实测：左栏(2/3)仅图表卡；右栏(1/3)为知识库卡 + Live Conversations */}
        <div className="space-y-6 lg:col-span-2">
          <ConversationChart data={chart} />
        </div>
        <div className="space-y-6">
          {suggestion ? <KnowledgeBaseCard suggestion={suggestion} /> : null}
          <LiveConversations conversations={conversations} />
        </div>
      </div>
    </div>
  );
}

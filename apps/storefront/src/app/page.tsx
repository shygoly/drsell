"use client";

import { Headset, MessagesSquare, Timer, Bot } from "lucide-react";
import { ConversationChart } from "@/components/business/conversation-chart";
import { KnowledgeBaseCard } from "@/components/business/knowledge-base-card";
import { LiveConversations } from "@/components/business/live-conversations";
import { StatCard } from "@/components/business/stat-card";
import { StatusBanner } from "@/components/business/status-banner";
import { useDashboardData } from "@/hooks/useDashboardData";

export default function DashboardPage() {
  const { stats, chart, conversations, suggestion, error } = useDashboardData();

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

      {/* 4 指标卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<MessagesSquare className="h-4 w-4" aria-hidden="true" />}
          label={"Today's conversations"}
          value={String(stats.conversationsToday)}
          delta={{ text: `${stats.conversationsTrendPct}%`, good: true }}
        />
        <StatCard
          icon={<Bot className="h-4 w-4" aria-hidden="true" />}
          label="AI resolution"
          value={`${stats.aiResolution}%`}
          delta={{ text: `Target: ${stats.aiResolutionTarget}%`, good: false }}
        />
        <StatCard
          icon={<Timer className="h-4 w-4" aria-hidden="true" />}
          label="Avg first response"
          value={`${stats.avgFirstResponseSec}s`}
          delta={{ text: `${stats.avgResponseTrendSec}s`, good: true }}
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

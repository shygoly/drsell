import { Headset, MessagesSquare, Timer, Bot } from "lucide-react";
import { ConversationChart } from "@/components/business/conversation-chart";
import { KnowledgeBaseCard } from "@/components/business/knowledge-base-card";
import { LiveConversations } from "@/components/business/live-conversations";
import { StatCard } from "@/components/business/stat-card";
import { fetchChart, fetchConversations, fetchStats, fetchSuggestion } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, chart, conversations, suggestion] = await Promise.all([
    fetchStats(),
    fetchChart(),
    fetchConversations(),
    fetchSuggestion(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-accent-deep text-xl font-bold">
          Good morning, Merchant
        </h2>
        <p className="text-muted-foreground text-sm">
          Here&apos;s what&apos;s happening with your AI assistant today.
        </p>
      </div>

      {/* 4 指标卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<MessagesSquare className="h-4 w-4" aria-hidden="true" />}
          label="Conversations today"
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
        <div className="space-y-6 lg:col-span-2">
          <ConversationChart data={chart} />
          <LiveConversations conversations={conversations} />
        </div>
        <div className="space-y-6">
          <KnowledgeBaseCard suggestion={suggestion} />
        </div>
      </div>
    </div>
  );
}

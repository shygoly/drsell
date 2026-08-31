"use client";

import { useDashboardData } from "@/hooks/useDashboardData";
import { InboxClient } from "./inbox-client";

export default function InboxPage() {
  const { conversations, loading, error } = useDashboardData();

  if (loading) {
    return <div className="text-muted-foreground p-6 text-sm">Loading…</div>;
  }
  if (error) {
    return (
      <div className="border-destructive/30 bg-destructive/5 text-destructive m-6 rounded-lg border px-4 py-3 text-sm">
        无法加载会话：{error}
      </div>
    );
  }
  // key 让会话列表到达后重建内部状态（选中项、消息）
  return (
    <InboxClient
      key={conversations.map((c) => c.id).join(",")}
      initialConversations={conversations}
    />
  );
}

import type { DashboardStats } from "@/lib/types";

/**
 * StatusBanner — 对齐 Stitch home_dashboard/code.html 的 StatusBanner。
 * 稿中实测：底色 #bbedd7（--accent）、内边距 8px 20px、字号 12px，脉冲圆点为 primary-container。
 *
 * 仅 home_dashboard 有此条，其余三屏没有，故不放进 AppShell。
 */
export function StatusBanner({ stats }: { stats: DashboardStats }) {
  const items = [
    "AI: Active",
    `${stats.conversationsToday} conversations today`,
    `${stats.aiResolution}% AI resolution`,
  ];

  return (
    <div className="bg-accent text-accent-foreground flex w-full shrink-0 items-center justify-between border-b px-5 py-2 text-xs">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span
            className="bg-primary-container animate-pulse-dot h-2 w-2 rounded-full"
            aria-hidden="true"
          />
          <span className="font-bold">Widget live</span>
        </div>
        {items.map((text) => (
          <div key={text} className="flex items-center gap-6">
            <span className="text-muted-foreground/50" aria-hidden="true">
              •
            </span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

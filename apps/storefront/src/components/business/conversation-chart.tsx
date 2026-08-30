import { Card, CardContent, CardTitle } from "@/components/ui/card";
import type { ChartPoint } from "@/lib/types";

interface ConversationChartProps {
  data: ChartPoint[];
}

/**
 * 会话量图表 — 忠实还原 Stitch 的 CSS 堆叠柱状图（无图表库依赖）。
 * 颜色经令牌映射：Stitch primary-container → chart-2；Stitch #EDEEEF → muted。
 */
export function ConversationChart({ data }: ConversationChartProps) {
  return (
    <Card className="gap-4 rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-accent-deep text-base">
          Conversation Volume (30 Days)
        </CardTitle>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="bg-muted h-3 w-3 rounded" aria-hidden="true" />
            Human
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-chart-2 h-3 w-3 rounded" aria-hidden="true" />
            AI Resolved
          </span>
        </div>
      </div>
      <CardContent className="px-0">
        <div
          role="img"
          aria-label="Stacked bar chart of conversation volume over the last 30 days"
          className="relative mt-2 flex h-64 items-end justify-between border-b border-l border-border/40 px-2 pt-8 pb-2"
        >
          <div
            className="pointer-events-none absolute inset-0 flex flex-col justify-between opacity-10"
            aria-hidden="true"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-0 w-full border-b" />
            ))}
          </div>
          {data.map((point) => (
            <div
              key={point.label}
              className="group relative z-10 flex h-full w-1/12 flex-col items-center justify-end gap-1"
            >
              <div
                className="bg-chart-2 w-4/5 rounded-t-sm transition-all group-hover:opacity-80"
                style={{ height: `${point.ai}%` }}
              />
              <div
                className="bg-muted w-4/5 rounded-t-sm transition-all group-hover:opacity-80"
                style={{ height: `${point.human}%` }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

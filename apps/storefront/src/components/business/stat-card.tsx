import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** 正向变化（涨/跌皆可显示为好，语义由 good 决定） */
  delta?: { text: string; good: boolean };
  /** 需要行动的警示标签 */
  alert?: string;
}

/** 指标卡 — Stitch "polaris-card p-md" 结构 → shadcn Card */
export function StatCard({ icon, label, value, delta, alert }: StatCardProps) {
  return (
    <Card className="gap-2 rounded-lg p-4 shadow-xs">
      <div className="text-muted-foreground text-stat flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-accent-deep text-xl font-semibold">{value}</span>
        {delta && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              delta.good
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {delta.good ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {delta.text}
          </span>
        )}
        {alert && (
          <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-xs font-medium">
            {alert}
          </span>
        )}
      </div>
    </Card>
  );
}

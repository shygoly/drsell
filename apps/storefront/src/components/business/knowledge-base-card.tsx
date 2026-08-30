import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { KnowledgeBaseSuggestion } from "@/lib/types";

/**
 * AI 建议卡 — 对齐 Stitch home_dashboard 的 Knowledge Base Optimization 卡片。
 *
 * 稿中实测：底色 #f6fafe（--background）、边框 rgba(18,168,117,.3)（primary-container/30）、
 * 圆形 lightbulb 图标在标题左侧、单个 "Add now" 按钮。
 * 稿中没有影响度徽章，也没有 Dismiss 按钮，故不渲染 suggestion.impact。
 */
export function KnowledgeBaseCard({
  suggestion,
}: {
  suggestion: KnowledgeBaseSuggestion;
}) {
  return (
    <Card className="bg-background border-primary-container/30 relative gap-4 overflow-hidden rounded-lg p-6">
      <div
        className="bg-primary/5 pointer-events-none absolute top-0 right-0 h-24 w-24 rounded-bl-full"
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span
            className="bg-accent text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            aria-hidden="true"
          >
            <Lightbulb className="h-4 w-4" />
          </span>
          <h3 className="text-accent-deep pt-1 font-semibold">
            {suggestion.title}
          </h3>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {suggestion.description}
        </p>
        <div className="mt-1">
          {/* 稿中此按钮用 primary-container 令牌，比 primary 浅 */}
          <Button
            size="sm"
            className="bg-primary-container hover:bg-primary-container/90"
          >
            Add now
          </Button>
        </div>
      </div>
    </Card>
  );
}

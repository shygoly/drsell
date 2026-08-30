import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { KnowledgeBaseSuggestion } from "@/lib/types";

/** AI 建议卡 — Stitch "AI Suggestion / Knowledge Base Optimization" 卡片 */
export function KnowledgeBaseCard({ suggestion }: { suggestion: KnowledgeBaseSuggestion }) {
  return (
    <Card className="relative gap-4 overflow-hidden rounded-lg p-6">
      <div
        className="bg-primary/5 pointer-events-none absolute top-0 right-0 h-24 w-24 rounded-bl-full"
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
          <Badge variant="success">{suggestion.impact}</Badge>
        </div>
        <h3 className="text-accent-deep font-semibold">{suggestion.title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {suggestion.description}
        </p>
        <div className="mt-1 flex gap-2">
          <Button size="sm">Review articles</Button>
          <Button size="sm" variant="ghost">
            Dismiss
          </Button>
        </div>
      </div>
    </Card>
  );
}

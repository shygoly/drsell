"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 路由级 error 态 — P6 三态之一 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="text-destructive h-10 w-10" aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">
          {error.message || "Failed to load dashboard data. Please retry."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

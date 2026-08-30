import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** 路由级 loading 态 — P6 三态之一 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-3 rounded-lg p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-lg p-6 lg:col-span-2">
          <Skeleton className="mb-4 h-5 w-64" />
          <Skeleton className="h-64 w-full" />
        </Card>
        <Card className="rounded-lg p-6">
          <Skeleton className="mb-3 h-5 w-40" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-4 h-4 w-3/4" />
          <Skeleton className="h-8 w-32" />
        </Card>
      </div>
    </div>
  );
}

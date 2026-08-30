import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="flex h-full flex-col gap-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="rounded-lg py-0">
          <div className="space-y-1 border-b p-3">
            <Skeleton className="h-8 w-full" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b p-3 last:border-b-0">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </Card>
        <Card className="rounded-lg py-0">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10 w-3/4 rounded-xl" />
            <Skeleton className="ml-auto h-16 w-3/4 rounded-xl" />
            <Skeleton className="h-10 w-1/2 rounded-xl" />
          </div>
        </Card>
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils';

type Props = {
  label: string;
  used: number;
  limit: number;
};

export function Meter({ label, used, limit }: Props) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = used > limit;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span>{label}</span>
        <b className={cn('font-data text-xs font-semibold tabular-nums', over && 'text-lost')}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </b>
      </div>
      <div className="relative h-[9px] overflow-hidden rounded-sm border border-border bg-sheet-2">
        <div
          className={cn('absolute inset-y-0 left-0', over ? 'runway-hatch-over w-full' : 'bg-ink-2')}
          style={over ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

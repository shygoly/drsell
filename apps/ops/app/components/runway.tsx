import { cn } from '@/lib/utils';

type RunwayProps = {
  windowStart: string | Date;
  windowEnd: string | Date;
  now?: Date;
  state: 'ok' | 'trial' | 'frozen' | 'lost';
  daysLabel?: string;
  large?: boolean;
  index?: number;
};

const stateFill: Record<RunwayProps['state'], string> = {
  ok: 'bg-on-surface-variant',
  trial: 'bg-trial-accent',
  frozen: 'runway-hatch-frozen',
  lost: 'bg-surface-dim',
};

const stateText: Record<RunwayProps['state'], string> = {
  ok: 'text-on-surface-variant',
  trial: 'text-trial-accent',
  frozen: 'text-frozen-accent',
  lost: 'text-on-surface-variant',
};

/**
 * 跑道条 — 运营台的签名元件。
 *
 * 盒样式取自 Stitch 稿（`h-2 border border-ink bg-surface`，全直角）；
 * **填充语义刻意与 Stitch 相反**：Stitch 从左填已用时间，我们填的是**剩余**时间——
 * 驱动运营动作的是「还剩多少路」，不是「走了多少路」。见 .stitch/deviations.json。
 */
export function Runway({
  windowStart,
  windowEnd,
  now = new Date(),
  state,
  daysLabel,
  large = false,
}: RunwayProps) {
  const start = new Date(windowStart).getTime();
  const end = new Date(windowEnd).getTime();
  const t = now.getTime();
  const total = Math.max(end - start, 1);
  const elapsed = Math.min(Math.max(t - start, 0), total);
  const spent = Math.round((elapsed / total) * 100);

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-3', large && 'flex-col items-stretch gap-2')}>
      {daysLabel && !large ? (
        <span
          className={cn(
            'font-data-mono text-data-mono w-6 text-right tabular-nums',
            stateText[state],
          )}
        >
          {daysLabel}
        </span>
      ) : null}
      <div
        className={cn(
          'relative border border-ink bg-surface',
          large ? 'h-3 w-full' : 'h-2 flex-1',
        )}
      >
        <div className="bg-surface-dim absolute inset-y-0 left-0" style={{ width: `${spent}%` }} />
        {state !== 'lost' ? (
          <div className={cn('absolute inset-y-0 right-0', stateFill[state])} style={{ left: `${spent}%` }} />
        ) : null}
        <div className="bg-ink absolute -top-[3px] -bottom-[3px] w-px" style={{ left: `${spent}%` }} />
      </div>
    </div>
  );
}

export function queueKindLabel(kind: 'trial' | 'period' | 'unfreeze') {
  if (kind === 'trial') return '14 天试用';
  if (kind === 'unfreeze') return '30 天解冻期';
  return '计费周期';
}

export function runwayState(
  kind: 'trial' | 'period' | 'unfreeze',
  status: string,
): 'ok' | 'trial' | 'frozen' | 'lost' {
  if (['DECLINED', 'EXPIRED', 'CANCELLED'].includes(status.toUpperCase())) return 'lost';
  if (kind === 'trial') return 'trial';
  if (kind === 'unfreeze') return 'frozen';
  return 'ok';
}

/** 队列行内动作：按状态给不同动作，文案说的就是按下去会发生的事 */
export function queueAction(
  kind: 'trial' | 'period' | 'unfreeze',
  status: string,
): string {
  if (['DECLINED', 'EXPIRED', 'CANCELLED'].includes(status.toUpperCase())) return '查看';
  if (kind === 'trial') return '延长试用';
  if (kind === 'unfreeze') return '发催缴提醒';
  return '查看';
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListFilter } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { queueAction, queueKindLabel, Runway, runwayState } from '@/app/components/runway';
import { opsFetch, type QueueItem } from '@/lib/api';

/** Stitch 稿的列比与格线：5 列网格，非 <table>。见 .stitch/rebuild/expiry_queue.html */
const GRID = 'grid grid-cols-[1.5fr_1fr_1fr_2fr_1fr]';
const CELL = 'px-3 border-r border-ink flex items-center';
const HEAD =
  'px-3 py-2 border-r border-ink font-label-caps text-label-caps uppercase text-on-surface-variant flex items-center';

/** 状态签。健康态（ACTIVE）不给颜色——只有需要处理的状态拿到信号色。 */
function StatusChip({ status }: { status: string }) {
  const s = status.toUpperCase();
  const tone =
    s === 'FROZEN'
      ? 'text-frozen-accent'
      : s === 'PENDING'
        ? 'text-trial-accent'
        : ['DECLINED', 'EXPIRED', 'CANCELLED'].includes(s)
          ? 'text-error line-through'
          : 'text-on-surface-variant';
  return (
    <span
      className={`bg-card-surface border-ink inline-flex items-center border px-2 py-0.5 text-[11px] font-bold tracking-tight uppercase ${tone}`}
    >
      {s}
    </span>
  );
}

export default function HomePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [totalShops, setTotalShops] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      opsFetch<QueueItem[]>('/ops/queue'),
      opsFetch<Array<{ shopDomain: string }>>('/ops/shops'),
    ])
      .then(([queue, shops]) => {
        setItems(queue);
        setTotalShops(shops.length);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AuthGate>
      <OpsShell active="queue" padded={false}>
        {/* Header —— Stitch 稿 h-16，与主区同底 */}
        <header className="border-ink bg-card-surface flex h-16 items-center justify-between border-b px-[16px]">
          <h1 className="font-headline-md text-headline-md text-ink m-0">到期队列</h1>
          <div className="flex items-center gap-4">
            <span className="font-data-mono text-data-mono text-on-surface-variant">
              {today} · {items.length} 家待处理 / 共 {totalShops} 家
            </span>
            <button
              type="button"
              aria-label="筛选"
              className="border-ink hover:bg-surface-container flex h-8 w-8 items-center justify-center border transition-colors"
            >
              <ListFilter className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-[16px]">
          {error ? <p className="text-error mb-3 text-sm">{error}</p> : null}

          <div className="bg-card-surface border-ink border shadow-none">
            <div className={`${GRID} border-ink bg-surface-container-low border-b`}>
              <div className={HEAD}>店铺</div>
              <div className={HEAD}>当前状态</div>
              <div className={HEAD}>归属账号</div>
              <div className={HEAD}>剩余天数</div>
              <div className={`${HEAD} border-r-0 justify-center`}>操作</div>
            </div>

            {items.map((item) => {
              const state = runwayState(item.queueKind, item.status);
              return (
                <div
                  key={item.shopDomain}
                  className={`${GRID} border-ink hover:bg-surface-container-low h-[44px] border-b transition-colors`}
                >
                  <div className={`${CELL} font-data-mono text-data-mono truncate`}>
                    <Link href={`/shops/${encodeURIComponent(item.shopDomain)}`}>
                      {item.shopDomain.replace('.myshopify.com', '')}
                    </Link>
                  </div>
                  <div className={CELL}>
                    <StatusChip status={item.status} />
                  </div>
                  <div className={`${CELL} font-data-mono text-data-mono truncate`}>
                    {item.ownerEmail ?? '—'}
                  </div>
                  <div className={`${CELL} gap-3`}>
                    <Runway
                      windowStart={item.windowStart}
                      windowEnd={item.windowEnd}
                      state={state}
                      daysLabel={String(item.daysRemaining)}
                    />
                    <span className="font-data-mono text-data-mono text-on-surface-variant whitespace-nowrap">
                      {queueKindLabel(item.queueKind)}
                    </span>
                  </div>
                  <div className="flex items-center justify-center px-3">
                    <button
                      type="button"
                      className="bg-card-surface text-ink border-ink font-label-caps text-label-caps hover:bg-surface-container border px-3 py-1 transition-colors"
                    >
                      {queueAction(item.queueKind, item.status)}
                    </button>
                  </div>
                </div>
              );
            })}

            {!items.length && !error ? (
              <div className="text-on-surface-variant px-3 py-6 text-center text-[13px]">
                暂无需要处理的店铺
              </div>
            ) : null}
          </div>

          <div className="text-on-surface-variant mt-3 flex items-center justify-between text-[13px]">
            <span className="font-data-mono text-data-mono">
              第 1–{items.length} 条 / 共 {totalShops} 条
            </span>
          </div>
        </div>
      </OpsShell>
    </AuthGate>
  );
}

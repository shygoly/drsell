'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MemoryStick, Radio, Settings2, Webhook } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { formatAuditAction, opsFetch, type AuditLogPage, type OpsPlan, type QueueItem } from '@/lib/api';

/**
 * /system —— 对齐 Stitch 项目 11226504772808429506 屏 05（System Health & Global Config）。
 * 数据源全部走现有 /ops 接口：队列、审计、套餐。没有 429 监控/同步任务表，就如实显示未接入。
 */

type ShopLite = { shopDomain: string; status: string };

const CARD = 'bg-primary-container border-outline-variant flex flex-col rounded-lg border p-4';
const CARD_TITLE =
  'text-on-surface mb-3 flex items-center justify-between gap-2 border-b border-outline-variant pb-2 text-sm font-bold';
const TH = 'text-on-surface-variant font-label-caps px-2 py-2 text-left text-[10px] uppercase';
const TD = 'px-2 py-1.5';

export default function SystemPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [shops, setShops] = useState<ShopLite[]>([]);
  const [audit, setAudit] = useState<AuditLogPage | null>(null);
  const [plans, setPlans] = useState<OpsPlan[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      opsFetch<QueueItem[]>('/ops/queue'),
      opsFetch<ShopLite[]>('/ops/shops'),
      opsFetch<AuditLogPage>('/ops/audit-logs?limit=10&offset=0'),
      opsFetch<OpsPlan[]>('/ops/plans'),
    ])
      .then(([q, s, a, p]) => {
        setQueue(q);
        setShops(s);
        setAudit(a);
        setPlans(p);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const trialCount = queue.filter((i) => i.queueKind === 'trial').length;
  const frozenCount = queue.filter((i) => i.status.toUpperCase() === 'FROZEN').length;

  return (
    <AuthGate>
      <OpsShell
        active="system"
        title="System Health & Telemetry"
        subtitle="Real-time monitoring of platform vitals, task queues, and API limits."
      >
        {error ? <p className="text-error text-sm">{error}</p> : null}

        <div className="grid grid-cols-12 gap-4">
          {/* 左列：AI Upstream Monitor + Sync Task Queue */}
          <div className="col-span-12 flex flex-col gap-4 xl:col-span-8">
            <section className={`${CARD} h-64`}>
              <h2 className={CARD_TITLE}>
                <span className="flex items-center gap-2">
                  <MemoryStick className="text-secondary h-4 w-4" aria-hidden="true" />
                  AI Upstream Monitor
                </span>
                <span className="bg-surface-container-low border-outline-variant text-on-surface-variant font-data-mono rounded border px-2 py-1 text-[10px]">
                  未接入 429 监控
                </span>
              </h2>
              <div className="flex flex-1 items-center justify-center text-center">
                <p className="text-on-surface-variant font-data-mono m-0 text-[12px]">
                  当前 ops API 未采集上游 429 指标。
                  <br />
                  接入后这里将按 Store ID / Endpoint / Error Rate / Last 429 呈现。
                </p>
              </div>
            </section>

            <section className={`${CARD} flex-1`}>
              <h2 className={CARD_TITLE}>
                <span className="flex items-center gap-2">
                  <Radio className="text-secondary h-4 w-4" aria-hidden="true" />
                  Sync Task Queue
                </span>
                <div className="flex gap-2">
                  <span className="bg-surface-container-low border-outline-variant text-on-surface-variant font-data-mono rounded border px-2 py-1 text-[10px]">
                    Total: {queue.length}
                  </span>
                  <span className="bg-surface-container-low border-primary text-primary font-data-mono rounded border px-2 py-1 text-[10px]">
                    Active: {queue.length - frozenCount}
                  </span>
                </div>
              </h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="bg-surface-container-low border-outline-variant text-on-surface-variant font-data-mono rounded border px-2 py-1 text-[10px]">
                  Trial: {trialCount}
                </span>
                <span className="bg-surface-container-low border-outline-variant text-frozen-accent font-data-mono rounded border px-2 py-1 text-[10px]">
                  Frozen: {frozenCount}
                </span>
                <span className="bg-surface-container-low border-outline-variant text-on-surface-variant font-data-mono rounded border px-2 py-1 text-[10px]">
                  Shops: {shops.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-surface-container-low border-outline-variant border-b">
                    <tr>
                      <th className={TH}>Store ID</th>
                      <th className={TH}>Type</th>
                      <th className={TH}>Status</th>
                      <th className={`${TH} text-right`}>Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="font-data-mono text-on-surface text-[12px]">
                    {queue.slice(0, 8).map((item) => (
                      <tr
                        key={item.shopDomain}
                        className="border-outline-variant hover:bg-surface-container-high border-b transition-colors"
                      >
                        <td className={`${TD} text-primary`}>
                          <Link href={`/shops/${encodeURIComponent(item.shopDomain)}`}>
                            {item.shopDomain.replace('.myshopify.com', '')}
                          </Link>
                        </td>
                        <td className={TD}>
                          {item.queueKind === 'trial'
                            ? 'Trial_Expiry'
                            : item.queueKind === 'period'
                              ? 'Billing_Period'
                              : 'Unfreeze_Window'}
                        </td>
                        <td className={TD}>{item.status.toUpperCase()}</td>
                        <td className={`${TD} text-right`}>{item.daysRemaining}d</td>
                      </tr>
                    ))}
                    {!queue.length ? (
                      <tr>
                        <td colSpan={4} className={`${TD} text-on-surface-variant text-center`}>
                          暂无待处理队列
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* 右列：Webhook Stream + Global Config Snapshot */}
          <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
            <section className={`${CARD} flex-1`}>
              <h2 className={CARD_TITLE}>
                <span className="flex items-center gap-2">
                  <Webhook className="text-secondary h-4 w-4" aria-hidden="true" />
                  Webhook / Audit Stream
                </span>
              </h2>
              <div className="flex flex-col gap-2">
                {(audit?.items ?? []).map((row) => (
                  <div
                    key={row.id}
                    className="border-outline-variant flex items-center justify-between gap-3 border-b pb-2 text-[11px]"
                  >
                    <span className="font-data-mono text-on-surface">
                      {row.createdAt.slice(0, 19).replace('T', ' ')}
                    </span>
                    <span className="text-on-surface-variant font-data-mono truncate">
                      {row.actorEmail} · {formatAuditAction(row.action)}
                    </span>
                    <span
                      className={
                        row.result === 'ok'
                          ? 'text-on-surface-variant'
                          : 'text-error font-bold'
                      }
                    >
                      {row.result === 'ok' ? 'OK' : 'FAIL'}
                    </span>
                  </div>
                ))}
                {!audit?.items.length ? (
                  <div className="text-on-surface-variant text-[11px]">暂无审计事件</div>
                ) : null}
              </div>
            </section>

            <section className={CARD}>
              <h2 className={CARD_TITLE}>
                <span className="flex items-center gap-2">
                  <Settings2 className="text-secondary h-4 w-4" aria-hidden="true" />
                  Global Config Snapshot
                </span>
              </h2>
              <div className="flex flex-col gap-3">
                {plans.map((plan) => (
                  <div
                    key={plan.code}
                    className="bg-surface-container-low border-outline-variant rounded border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-on-surface font-data-mono text-[13px]">
                        {plan.displayName}
                      </span>
                      <span className="text-primary font-data-mono text-[13px]">
                        ${plan.priceUsd}
                      </span>
                    </div>
                    <div className="text-on-surface-variant font-data-mono mt-1 text-[11px]">
                      Trial {plan.trialDays}d · Chat {plan.chatLimit.toLocaleString()} · AI{' '}
                      {plan.aiResolvedLimit.toLocaleString()} · Seats {plan.seatLimit}
                    </div>
                  </div>
                ))}
                {!plans.length ? (
                  <div className="text-on-surface-variant text-[11px]">暂无套餐定义</div>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </OpsShell>
    </AuthGate>
  );
}

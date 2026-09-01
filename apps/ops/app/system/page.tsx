'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, CheckCircle2, Radio, Settings2, Webhook } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { formatAuditAction, opsFetch, type AuditLogPage, type OpsPlan, type QueueItem } from '@/lib/api';

/**
 * /system —— 对齐 Stitch 项目 11226504772808429506 屏 05（System Health & Global Config）。
 * 数据源全部走现有 /ops 接口：队列、审计、套餐；无 429 监控/同步任务表，不做假数据。
 */

type ShopLite = { shopDomain: string; status: string };

const CARD = 'bg-primary-container border-outline-variant rounded-lg border p-4 flex flex-col';
const CARD_TITLE =
  'text-on-surface mb-3 flex items-center gap-2 border-b border-outline-variant pb-2 text-sm font-bold';
const LABEL = 'text-on-surface-variant font-label-caps mb-1 text-[10px] uppercase';
const VALUE = 'text-on-surface font-display text-2xl font-bold';

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
      opsFetch<AuditLogPage>('/ops/audit-logs?limit=12&offset=0'),
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

  const frozenCount = queue.filter((i) => i.status.toUpperCase() === 'FROZEN').length;
  const trialCount = queue.filter((i) => i.queueKind === 'trial').length;
  const auditTotal = audit?.total ?? 0;

  return (
    <AuthGate>
      <OpsShell
        active="system"
        title="系统健康"
        subtitle="平台体征、任务队列与审计事件（Stitch 05）"
      >
        {error ? <p className="text-error text-sm">{error}</p> : null}

        {/* 概览四格 */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={CARD}>
            <div className={LABEL}>店铺总数</div>
            <div className={VALUE}>{shops.length}</div>
          </div>
          <div className={CARD}>
            <div className={LABEL}>待处理队列</div>
            <div className={VALUE}>{queue.length}</div>
          </div>
          <div className={CARD}>
            <div className={LABEL}>冻结中</div>
            <div className="text-frozen-accent font-display text-2xl font-bold">{frozenCount}</div>
          </div>
          <div className={CARD}>
            <div className={LABEL}>审计事件</div>
            <div className={VALUE}>{auditTotal.toLocaleString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* 左列：队列 + 审计 */}
          <div className="col-span-12 flex flex-col gap-4 xl:col-span-8">
            <section className={CARD}>
              <h2 className={CARD_TITLE}>
                <Radio className="text-secondary h-4 w-4" aria-hidden="true" />
                同步与到期队列
              </h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="bg-surface-container-low border-outline-variant text-on-surface-variant font-data-mono rounded border px-2 py-1 text-[11px]">
                  Total: {queue.length}
                </span>
                <span className="bg-surface-container-low border-primary text-primary font-data-mono rounded border px-2 py-1 text-[11px]">
                  Trial: {trialCount}
                </span>
                <span className="bg-surface-container-low border-outline-variant text-frozen-accent font-data-mono rounded border px-2 py-1 text-[11px]">
                  Frozen: {frozenCount}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="border-outline-variant bg-surface-container-low border-b">
                    <tr>
                      <th className="text-on-surface-variant font-label-caps px-2 py-2 text-[10px] uppercase">店铺</th>
                      <th className="text-on-surface-variant font-label-caps px-2 py-2 text-[10px] uppercase">类型</th>
                      <th className="text-on-surface-variant font-label-caps px-2 py-2 text-[10px] uppercase">状态</th>
                      <th className="text-on-surface-variant font-label-caps px-2 py-2 text-right text-[10px] uppercase">剩余</th>
                    </tr>
                  </thead>
                  <tbody className="font-data-mono text-on-surface text-[12px]">
                    {queue.slice(0, 8).map((item) => (
                      <tr
                        key={item.shopDomain}
                        className="border-outline-variant hover:bg-surface-container-high border-b transition-colors"
                      >
                        <td className="text-primary px-2 py-1.5">
                          <Link href={`/shops/${encodeURIComponent(item.shopDomain)}`}>
                            {item.shopDomain.replace('.myshopify.com', '')}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5">
                          {item.queueKind === 'trial'
                            ? 'Trial'
                            : item.queueKind === 'period'
                              ? 'Period'
                              : 'Unfreeze'}
                        </td>
                        <td className="px-2 py-1.5">{item.status.toUpperCase()}</td>
                        <td className="px-2 py-1.5 text-right">{item.daysRemaining}d</td>
                      </tr>
                    ))}
                    {!queue.length ? (
                      <tr>
                        <td colSpan={4} className="text-on-surface-variant px-2 py-3 text-center">
                          暂无待处理队列
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${CARD} flex-1`}>
              <h2 className={CARD_TITLE}>
                <Webhook className="text-secondary h-4 w-4" aria-hidden="true" />
                最近审计事件流
              </h2>
              <div className="flex flex-col gap-2">
                {(audit?.items ?? []).map((row) => (
                  <div
                    key={row.id}
                    className="border-outline-variant flex items-center justify-between gap-3 border-b pb-2 text-[12px]"
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
                  <div className="text-on-surface-variant text-[12px]">暂无审计事件</div>
                ) : null}
              </div>
            </section>
          </div>

          {/* 右列：全局配置快照 */}
          <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
            <section className={CARD}>
              <h2 className={CARD_TITLE}>
                <Settings2 className="text-secondary h-4 w-4" aria-hidden="true" />
                Global Config Snapshot
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
                      试用 {plan.trialDays} 天 · 对话 {plan.chatLimit.toLocaleString()} · AI 解决{' '}
                      {plan.aiResolvedLimit.toLocaleString()} · 坐席 {plan.seatLimit}
                    </div>
                  </div>
                ))}
                {!plans.length ? (
                  <div className="text-on-surface-variant text-[12px]">暂无套餐定义</div>
                ) : null}
              </div>
            </section>

            <section className={CARD}>
              <h2 className={CARD_TITLE}>
                <Activity className="text-secondary h-4 w-4" aria-hidden="true" />
                体征摘要
              </h2>
              <div className="flex flex-col gap-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    审计写入
                  </span>
                  <span className="text-on-surface font-data-mono">正常</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    429 监控
                  </span>
                  <span className="text-on-surface-variant font-data-mono">未接入</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </OpsShell>
    </AuthGate>
  );
}

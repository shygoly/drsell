'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Hourglass, Mail, ReceiptText, Activity } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { ShopActions } from '@/app/shops/[domain]/actions';
import { formatAuditAction, opsFetch, type AuditLogPage, type ShopDetail } from '@/lib/api';

const PANEL = 'bg-card-surface flex h-full flex-col gap-4 p-5';
const PANEL_HEAD = 'border-outline-variant flex items-center gap-2 border-b pb-2';
const PANEL_TITLE = 'font-label-caps text-label-caps m-0 font-bold uppercase tracking-widest';
const KV = 'border-outline-variant/10 flex items-end justify-between border-b pb-1';
const KV_KEY = 'font-data-mono text-on-surface-variant text-[11px] uppercase';
const KV_VAL = 'font-data-mono text-[13px]';

function fmt(d: string | null | undefined) {
  return d ? String(d).slice(0, 10) : '—';
}

/** 用量计。超额那条给 error 色 —— 只有需要处理的才拿到颜色。 */
function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const over = used > limit;
  const pct = Math.min(Math.round((used / Math.max(limit, 1)) * 100), 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="font-data-mono flex justify-between text-[11px]">
        <span className="uppercase">{label}</span>
        <span className={over ? 'text-error font-bold' : undefined}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div
        className={
          over
            ? 'bg-error-container border-error h-2 w-full overflow-hidden border'
            : 'bg-surface border-outline-variant h-2 w-full overflow-hidden border'
        }
      >
        <div
          className={over ? 'bg-error h-full w-full' : 'bg-primary h-full'}
          style={over ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ShopDetailPage({ params }: { params: Promise<{ domain: string }> }) {
  const [domain, setDomain] = useState('');
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [audit, setAudit] = useState<AuditLogPage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void params.then((p) => setDomain(decodeURIComponent(p.domain)));
  }, [params]);

  const reload = useCallback(() => {
    if (!domain) return;
    opsFetch<ShopDetail>(`/ops/shops/${encodeURIComponent(domain)}`)
      .then(setShop)
      .catch((e) => setError(String(e.message ?? e)));
    opsFetch<AuditLogPage>(
      `/ops/audit-logs?q=${encodeURIComponent(domain)}&limit=8&offset=0`,
    )
      .then(setAudit)
      .catch(() => undefined);
  }, [domain]);

  useEffect(reload, [reload]);

  const frozen = shop?.status?.toUpperCase() === 'FROZEN';
  const terminal = ['DECLINED', 'EXPIRED', 'CANCELLED'].includes(
    (shop?.status ?? '').toUpperCase(),
  );

  // 可用期：冻结期优先，其次试用，再次计费周期
  const windowEnd = shop?.unfreezeBy ?? shop?.trialEnds ?? shop?.currentPeriodEnd ?? null;
  const windowStart = shop?.frozenAt ?? shop?.periodStart ?? shop?.installedAt ?? null;
  const daysLeft = windowEnd
    ? Math.max(Math.ceil((new Date(windowEnd).getTime() - Date.now()) / 86_400_000), 0)
    : null;
  const spent =
    windowStart && windowEnd
      ? Math.min(
          Math.max(
            ((Date.now() - new Date(windowStart).getTime()) /
              Math.max(new Date(windowEnd).getTime() - new Date(windowStart).getTime(), 1)) *
              100,
            0,
          ),
          100,
        )
      : 20;

  return (
    <AuthGate>
      <OpsShell active="shops" padded={false}>
        <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 overflow-auto p-[16px] md:p-6 lg:p-8">
          {error ? <p className="text-error text-sm">{error}</p> : null}

          {/* Header */}
          <div className="border-outline-variant flex flex-col items-start justify-between gap-4 border-b pb-4 md:flex-row md:items-end">
            <div>
              <div className="mb-1 flex items-center gap-3">
                <h1 className="font-headline-lg text-headline-lg text-on-surface m-0 font-bold tracking-tight">
                  {domain || '…'}
                </h1>
                {shop ? (
                  <span
                    className={
                      frozen
                        ? 'bg-surface border-frozen-accent text-frozen-accent font-label-caps text-label-caps inline-flex items-center border px-2 py-0.5'
                        : terminal
                          ? 'bg-surface border-error text-error font-label-caps text-label-caps inline-flex items-center border px-2 py-0.5 line-through'
                          : 'bg-surface border-outline-variant text-on-surface-variant font-label-caps text-label-caps inline-flex items-center border px-2 py-0.5'
                    }
                  >
                    {shop.status.toUpperCase()}
                  </span>
                ) : null}
              </div>
              <div className="font-data-mono text-data-mono text-on-surface-variant flex items-center gap-2">
                <Mail className="h-4 w-4" aria-hidden="true" />
                归属: {shop?.ownerEmail ?? '未认领'}
                {shop?.accountShopCount ? ` · 名下 ${shop.accountShopCount} 家店` : ''}
              </div>
            </div>
            {shop?.isBillingShop ? (
              <div className="flex items-center gap-2">
                <span className="font-data-mono text-on-surface-variant text-[10px] uppercase">
                  组内计费店
                </span>
                <span className="font-data-mono text-data-mono bg-surface border-outline-variant border px-2 py-1">
                  收全额
                </span>
              </div>
            ) : null}
          </div>

          {/* 三栏面板：格线靠父级 bg-primary 透出 */}
          <div className="border-outline-variant bg-primary grid shrink-0 grid-cols-1 gap-0 border md:grid-cols-2 lg:grid-cols-3">
            {/* 计费 */}
            <div className={`${PANEL} border-outline-variant border-b md:border-b-0 md:border-r`}>
              <div className={PANEL_HEAD}>
                <ReceiptText className="h-6 w-6" aria-hidden="true" />
                <h2 className={PANEL_TITLE}>计费</h2>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-3">
                <div className={KV}>
                  <span className={KV_KEY}>套餐</span>
                  <span className={`${KV_VAL} font-bold`}>
                    {shop?.planName ?? shop?.planCode ?? '—'}
                    {shop?.planPriceUsd ? ` · $${shop.planPriceUsd}/月` : ''}
                  </span>
                </div>
                <div className={KV}>
                  <span className={KV_KEY}>安装于</span>
                  <span className={KV_VAL}>{fmt(shop?.installedAt)}</span>
                </div>
                <div className={KV}>
                  <span className={KV_KEY}>下次扣费</span>
                  <span className={`${KV_VAL} ${frozen ? 'text-error font-bold' : ''}`}>
                    {frozen ? '欠费' : fmt(shop?.currentPeriodEnd)}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className={KV_KEY}>上次成功扣费</span>
                  <span className={KV_VAL}>{fmt(shop?.lastSuccessfulChargeAt)}</span>
                </div>
              </div>
            </div>

            {/* 本周期用量 */}
            <div className={`${PANEL} border-outline-variant border-b lg:border-b-0 lg:border-r`}>
              <div className={PANEL_HEAD}>
                <Activity className="h-6 w-6" aria-hidden="true" />
                <h2 className={PANEL_TITLE}>本周期用量</h2>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-4">
                <Meter label="对话" used={shop?.chatCount ?? 0} limit={shop?.chatLimit ?? 0} />
                <Meter
                  label="AI 解决"
                  used={shop?.aiResolved ?? 0}
                  limit={shop?.aiResolvedLimit ?? 0}
                />
                <Meter
                  label="坐席"
                  used={shop?.agentSeats ?? 0}
                  limit={shop?.agentSeatsLimit ?? 0}
                />
                {shop?.overQuotaNote ? (
                  <p className="font-data-mono text-on-surface-variant m-0 text-[11px]">
                    {shop.overQuotaNote}
                  </p>
                ) : null}
              </div>
            </div>

            {/* 可用期 */}
            <div className={PANEL}>
              <div className={PANEL_HEAD}>
                <Hourglass className="h-6 w-6" aria-hidden="true" />
                <h2 className={PANEL_TITLE}>可用期</h2>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`font-data-mono mb-1 text-[10px] uppercase tracking-widest ${frozen ? 'text-frozen-accent' : 'text-on-surface-variant'}`}
                  >
                    剩余
                  </div>
                  <div className="font-headline-lg text-on-surface text-[52px] font-black leading-none tracking-tighter">
                    {daysLeft ?? '—'} 天
                  </div>
                </div>
                <div className="flex w-full flex-col gap-1">
                  <div className="font-data-mono text-on-surface-variant flex justify-between text-[10px]">
                    <span>{frozen ? '冻结中' : '当前周期'}</span>
                    <span>{frozen ? '订阅终止' : '下次扣费'}</span>
                  </div>
                  <div className="bg-surface border-outline-variant flex h-3 w-full border">
                    <div
                      className={`border-outline-variant h-full border-r ${frozen ? 'bg-frozen-accent' : 'bg-on-surface-variant'}`}
                      style={{ width: `${spent}%` }}
                    />
                    <div className="relative h-full flex-1 overflow-hidden bg-transparent">
                      <div className="runway-hatch-frozen absolute inset-0" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stitch 08 的 Recent Sync Events：没有 sync-event 表，用该店的审计事件流代替 */}
          <div className="bg-card-surface border-outline-variant shrink-0 border">
            <div className="border-outline-variant flex items-center justify-between border-b px-4 py-2">
              <h2 className="font-label-caps text-label-caps text-on-surface m-0 flex items-center gap-2 uppercase">
                <Activity className="h-4 w-4" aria-hidden="true" />
                最近店铺事件
              </h2>
              <Link href={`/audit?q=${encodeURIComponent(domain)}`} className="font-label-caps text-on-surface-variant text-[10px] uppercase">
                全部
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="bg-surface-container-low border-outline-variant border-b">
                  <tr>
                    <th className="text-on-surface-variant font-label-caps px-3 py-2 text-[10px] uppercase">时间</th>
                    <th className="text-on-surface-variant font-label-caps px-3 py-2 text-[10px] uppercase">操作者</th>
                    <th className="text-on-surface-variant font-label-caps px-3 py-2 text-[10px] uppercase">动作</th>
                    <th className="text-on-surface-variant font-label-caps px-3 py-2 text-right text-[10px] uppercase">结果</th>
                  </tr>
                </thead>
                <tbody className="font-data-mono text-on-surface text-[12px]">
                  {(audit?.items ?? []).map((row) => (
                    <tr key={row.id} className="border-outline-variant hover:bg-surface-container-high border-b transition-colors">
                      <td className="px-3 py-2">{row.createdAt.slice(0, 19).replace('T', ' ')}</td>
                      <td className="px-3 py-2">{row.actorEmail}</td>
                      <td className="px-3 py-2">{formatAuditAction(row.action)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={row.result === 'ok' ? 'text-on-surface-variant' : 'text-error font-bold'}>
                          {row.result === 'ok' ? '成功' : '失败'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!audit?.items.length ? (
                    <tr><td colSpan={4} className="text-on-surface-variant px-3 py-2 text-center">暂无事件</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 稿子里动作条是 main 的直接子元素，贴底满宽，不在内容容器的内边距里 */}
        {domain ? (
          <div className="border-outline-variant bg-card-surface sticky bottom-0 z-20 mt-auto shrink-0 border-t p-4 md:p-[16px]">
            <ShopActions
              domain={domain}
              onDone={reload}
              widgetVisible={shop?.widgetVisible !== false}
            />
          </div>
        ) : null}
      </OpsShell>
    </AuthGate>
  );
}

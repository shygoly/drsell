'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  BadgeCheck,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  ListChecks,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { ShopActions } from '@/app/shops/[domain]/actions';
import { formatAuditAction, opsFetch, type AuditLogPage, type ShopDetail } from '@/lib/api';
import { extendFreeze, postShopAction } from '@/lib/shop-actions';

/** 稿子屏 08 实测卡高 306px（y 235→541）；我们的内容一致短 5px，钉住高度 */
const CARD = 'bg-primary-container border-card-border rounded-xl border p-6';

/** Shopify 安装需要的 scope，用于「授权范围」卡的缺失检测 */
const REQUIRED_SCOPES = [
  'read_products',
  'write_orders',
  'read_customers',
  'write_inventory',
];

function fmt(d: string | null | undefined) {
  return d ? String(d).slice(0, 10) : '—';
}

export default function ShopDetailPage({ params }: { params: Promise<{ domain: string }> }) {
  const [domain, setDomain] = useState('');
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [audit, setAudit] = useState<AuditLogPage | null>(null);
  const [events, setEvents] = useState<AuditLogPage | null>(null);
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
      `/ops/audit-logs?q=${encodeURIComponent(domain)}&limit=3&offset=0`,
    )
      .then(setEvents)
      .catch(() => undefined);
    opsFetch<AuditLogPage>(
      `/ops/audit-logs?q=${encodeURIComponent(domain)}&limit=3&offset=0`,
    )
      .then(setAudit)
      .catch(() => undefined);
  }, [domain]);

  useEffect(reload, [reload]);

  const frozen = shop?.status?.toUpperCase() === 'FROZEN';
  const aiUsed = shop?.aiResolved ?? 0;
  const aiLimit = shop?.aiResolvedLimit ?? 0;
  const aiOver = aiUsed > aiLimit;
  const aiPct = Math.min(Math.round((aiUsed / Math.max(aiLimit, 1)) * 100), 100);
  const overageUsd = Math.max(aiUsed - aiLimit, 0) * 0.9;
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

  function onExtend() {
    const v = window.prompt('延长解冻期多少天？（1–30）', '7');
    if (v === null) return;
    const days = Number(v);
    if (!Number.isInteger(days) || days < 1 || days > 30) return;
    void extendFreeze(domain, days).then(reload);
  }

  return (
    <AuthGate>
      <OpsShell active="shops" padded={false} chrome="topbar">
        {/* 逐字移植自 .stitch/project-.../designs/08_Store_&_Subscription_Details.html
            的 <main> 内容区。spacing 令牌按 skill 门禁第 5 条展开成 arbitrary：
            container-padding 24px / gutter 12px / row-height-dense 32px。
            图标 Material Symbols → lucide（DS-3 的精神，已在 DESIGN.md 记为明确偏离）。 */}
        <div className="flex-1 overflow-y-auto p-[24px]">
          {error ? <p className="text-error text-sm">{error}</p> : null}

          {/* Audit Bar (Persistent top-level banner) */}
          <div className="bg-primary-container text-on-primary-container font-data-mono text-data-mono border-outline-variant mb-6 flex items-center justify-between rounded border px-4 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2">
              <div className="bg-error h-2 w-2 animate-pulse rounded-full" />
              <span>AUDIT ACTIVE: SESSION LOGGING ENGAGED</span>
            </div>
            <span className="text-on-surface-variant opacity-70">INV-3 · 写操作全部留痕</span>
          </div>

          {/* Page Header */}
          <div className="border-outline-variant mb-8 flex items-end justify-between border-b pb-4">
            <div>
              <h1 className="font-display-sm text-display-sm text-on-surface m-0 mb-1 flex items-center gap-2">
                {domain || '…'}
                <BadgeCheck className="text-primary h-5 w-5" aria-hidden="true" />
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant m-0">
                归属: {shop?.ownerEmail ?? '未认领'}
                {shop?.accountShopCount ? ` · 名下 ${shop.accountShopCount} 家店` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              {/* 稿子把动作放在页头（Manual Resync / Manage Access），没有底部动作条 */}
              {domain ? (
                <ShopActions
                  domain={domain}
                  onDone={reload}
                  widgetVisible={shop?.widgetVisible !== false}
                />
              ) : null}
              <span className="bg-primary text-on-primary font-label-caps text-label-caps rounded px-4 py-2 font-bold shadow-lg">
                {shop?.isBillingShop ? '组内计费店' : '非计费店'}
              </span>
            </div>
          </div>

          {/* Bento Grid Layout */}
          <div className="mb-8 grid grid-cols-12 gap-[12px]">
            {/* Subscription Status Card (Span 4) */}
            <div className="bg-primary-container border-card-border group relative col-span-12 min-h-[306px] overflow-hidden rounded-xl border p-6 lg:col-span-4">
              <div className="bg-error-container absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-30" />
              <h3 className="font-label-caps text-label-caps text-on-surface-variant m-0 mb-4 flex h-5 items-center gap-2">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> 订阅状态
              </h3>
              <div className="mb-6 flex items-center justify-between">
                <span className="font-headline-md text-headline-md text-on-surface font-bold">
                  {shop?.planName ?? shop?.planCode ?? '—'}
                </span>
                <span
                  className={
                    frozen
                      ? 'bg-error-container/20 text-error border-error/30 font-data-mono text-data-mono flex items-center gap-1 rounded border px-2 py-1'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant font-data-mono text-data-mono flex items-center gap-1 rounded border px-2 py-1'
                  }
                >
                  <div className={frozen ? 'bg-error h-1.5 w-1.5 animate-pulse rounded-full' : 'bg-on-surface-variant h-1.5 w-1.5 rounded-full'} />
                  {(shop?.status ?? '—').toUpperCase()}
                </span>
              </div>
              {frozen ? (
                <div className="bg-surface-container border-error/20 mb-4 rounded border p-4">
                  <p className="font-body-sm text-body-sm text-error m-0 mb-1 font-semibold">需要处理</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
                    该店处在 30 天解冻窗口内。逾期后订阅终止，只能重新走一次。
                  </p>
                </div>
              ) : null}
              <div className="border-card-border flex items-center justify-between border-t pt-2">
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant m-0 mb-1">剩余天数</p>
                  <p className={`font-display-sm text-display-sm m-0 font-bold ${frozen ? 'text-error' : 'text-on-surface'}`}>
                    {daysLeft !== null ? String(daysLeft).padStart(2, '0') : '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExtend}
                  className="text-primary hover:text-primary-fixed font-label-caps border-primary/30 bg-primary-container/20 rounded border px-3 py-1 text-sm transition-colors"
                >
                  延长解冻期
                </button>
              </div>
            </div>

            {/* Billing Usage Card (Span 4) */}
            <div className="bg-primary-container border-card-border relative col-span-12 min-h-[306px] rounded-xl border p-6 lg:col-span-4">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant m-0 mb-4 flex h-5 items-center gap-2">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" /> AI 解决用量
              </h3>
              <div className="mb-6">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-display-sm text-display-sm text-on-surface">
                    {aiUsed.toLocaleString()}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    / {aiLimit.toLocaleString()} Limit
                  </span>
                </div>
                <div className="bg-surface-container-highest mb-1 h-2 w-full rounded-full">
                  <div
                    className={`h-2 rounded-full ${aiOver ? 'bg-error' : 'bg-secondary'}`}
                    style={{ width: `${aiPct}%` }}
                  />
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0 text-right">
                  {aiPct}% Utilized
                </p>
              </div>
              <div className="space-y-3">
                <div className="border-card-border flex items-center justify-between border-b pb-2">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">本周期</span>
                  <span className="font-data-mono text-data-mono text-on-surface">
                    {fmt(shop?.periodStart)} – {fmt(shop?.currentPeriodEnd)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">超额预估</span>
                  <span className={`font-data-mono text-data-mono font-bold ${aiOver ? 'text-error' : 'text-on-surface'}`}>
                    {aiOver ? `+$${overageUsd.toFixed(2)}` : '$0.00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Scope Checker Card (Span 4) */}
            <div className="bg-primary-container border-card-border col-span-12 min-h-[306px] rounded-xl border p-6 lg:col-span-4">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant m-0 mb-4 flex h-5 items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> 授权范围
              </h3>
              <ul className="m-0 list-none space-y-2 p-0">
                {Array.from(new Set([...REQUIRED_SCOPES, ...(shop?.scopes ?? [])])).map((sc) => {
                  const granted = shop?.scopes?.includes(sc) ?? false;
                  return (
                    <li
                      key={sc}
                      className={
                        granted
                          ? 'bg-surface-container-low border-outline-variant flex h-[37px] items-center justify-between rounded border p-2'
                          : 'bg-error-container/10 border-error/50 flex h-[37px] items-center justify-between rounded border p-2'
                      }
                    >
                      <span className={`font-data-mono text-data-mono ${granted ? 'text-on-surface' : 'text-error'}`}>
                        {sc}
                      </span>
                      {granted ? (
                        <CheckCircle2 className="text-primary h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <XCircle className="text-error h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Event Log Table */}
          <div className="bg-primary-container border-card-border overflow-hidden rounded-xl border">
            <div className="border-card-border bg-surface-container-lowest flex items-center justify-between border-b p-4">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant m-0 flex items-center gap-2">
                <ListChecks className="h-3.5 w-3.5" aria-hidden="true" /> 最近店铺事件
              </h3>
              <Link href="/audit" className="text-primary hover:text-primary-fixed font-label-caps text-sm no-underline transition-colors">
                全部
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-card-border border-b">
                    <th className="bg-surface-container sticky left-0 z-10 h-[32px] p-3">时间 (UTC)</th>
                    <th className="h-[32px] p-3">动作</th>
                    <th className="h-[32px] p-3">操作者</th>
                    <th className="h-[32px] p-3">结果</th>
                    <th className="bg-surface-container sticky right-0 z-10 h-[32px] p-3 pr-6 text-right">IP</th>
                  </tr>
                </thead>
                <tbody className="font-data-mono text-data-mono">
                  {(events?.items ?? []).map((row) => {
                    const failed = row.result !== 'ok';
                    return (
                      <tr key={row.id} className="border-card-border hover:bg-surface-container-high h-[46px] border-b transition-colors">
                        <td className="text-on-surface-variant p-3">
                          {row.createdAt.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="text-on-surface p-3">{formatAuditAction(row.action)}</td>
                        <td className="text-on-surface-variant p-3">
                          <span className="flex items-center gap-2">
                            {row.actorEmail === 'unknown' ? (
                              <CircleHelp className="h-3 w-3 shrink-0" aria-hidden="true" />
                            ) : (
                              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                            )}
                            {row.actorEmail}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={failed ? 'text-error flex items-center gap-1' : 'text-primary flex items-center gap-1'}>
                            <div className={failed ? 'bg-error h-2 w-2 rounded-full' : 'bg-primary h-2 w-2 rounded-full'} />
                            {failed ? 'FAIL' : 'OK'}
                          </span>
                        </td>
                        <td className="text-on-surface-variant p-3 pr-6 text-right">{row.ip ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </OpsShell>
    </AuthGate>
  );
}

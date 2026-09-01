'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  CheckCircle2,
  CreditCard,
  Mail,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { ShopActions } from '@/app/shops/[domain]/actions';
import { formatAuditAction, opsFetch, type AuditLogPage, type ShopDetail } from '@/lib/api';
import { extendFreeze } from '@/lib/shop-actions';

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

  return (
    <AuthGate>
      <OpsShell active="shops" padded={false} chrome="topbar">
        <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 overflow-auto p-[16px] md:p-6 lg:p-8">
          {error ? <p className="text-error text-sm">{error}</p> : null}

          {/* 稿子屏 08：审计信息在内容区，不用全局 REC 条 */}
          <div className="bg-primary-container text-on-primary-container border-outline-variant font-data-mono text-data-mono mb-6 flex items-center justify-between rounded border px-4 py-2">
            <span className="flex items-center gap-2">
              <span className="bg-error h-2 w-2 animate-pulse rounded-full" />
              AUDIT ACTIVE: SESSION LOGGING ENGAGED
            </span>
            <span className="text-on-surface-variant opacity-70">INV-3 · 写操作全部留痕</span>
          </div>

          {/* Header */}
          <div className="flex flex-col items-start justify-between gap-4 pb-4 md:flex-row md:items-end">
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

          {/* 稿子屏 08 的 Bento：订阅状态 / AI 解决用量 / 授权范围 */}
          <div className="grid grid-cols-12 gap-3">
            {/* 订阅状态 */}
            <div className={`col-span-12 lg:col-span-4 ${CARD}`}>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-4 flex items-center gap-2">
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                订阅状态
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
                  <span className={frozen ? 'bg-error h-1.5 w-1.5 rounded-full' : 'bg-on-surface-variant h-1.5 w-1.5 rounded-full'} />
                  {(shop?.status ?? '—').toUpperCase()}
                </span>
              </div>
              {frozen ? (
                <div className="bg-surface-container border-error/20 mb-4 rounded border p-4">
                  <p className="font-body-sm text-body-sm text-error m-0 mb-1 font-semibold">
                    需要处理
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
                    该店处在 30 天解冻窗口内。逾期后订阅终止，只能重新走一次。
                  </p>
                </div>
              ) : null}
              <div className="border-card-border flex items-center justify-between border-t pt-2">
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant m-0 mb-1">
                    剩余天数
                  </p>
                  <p
                    className={`font-display-sm text-display-sm m-0 font-bold ${frozen ? 'text-error' : 'text-on-surface'}`}
                  >
                    {daysLeft !== null ? String(daysLeft).padStart(2, '0') : '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const v = window.prompt('延长解冻期多少天？（1–30）', '7');
                    if (v === null) return;
                    const days = Number(v);
                    if (!Number.isInteger(days) || days < 1 || days > 30) return;
                    void extendFreeze(domain, days).then(reload);
                  }}
                  title={`${frozen ? '解冻截止' : '下次扣费'} ${fmt(windowEnd)}`}
                  className="text-primary hover:text-primary-fixed border-primary/30 bg-primary-container/20 font-label-caps rounded border px-3 py-1 text-sm transition-colors"
                >
                  延长解冻期
                </button>
              </div>
            </div>

            {/* AI 解决用量 */}
            <div className={`col-span-12 lg:col-span-4 ${CARD}`}>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4" aria-hidden="true" />
                AI 解决用量
              </h3>
              <div className="mb-2 flex items-end justify-between">
                <span className="font-display-sm text-display-sm text-on-surface font-bold">
                  {(shop?.aiResolved ?? 0).toLocaleString()}
                </span>
                <span className="text-on-surface-variant font-data-mono text-[12px]">
                  / {(shop?.aiResolvedLimit ?? 0).toLocaleString()} Limit
                </span>
              </div>
              <div className="bg-surface-container border-outline-variant mb-1 h-2 w-full overflow-hidden rounded border">
                <div
                  className={aiOver ? 'bg-error h-full w-full' : 'bg-primary h-full'}
                  style={aiOver ? undefined : { width: `${aiPct}%` }}
                />
              </div>
              <div className="text-on-surface-variant font-data-mono mb-4 text-right text-[11px]">
                {aiPct}% Utilized
              </div>
              <dl className="m-0 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <dt className="text-on-surface-variant font-body-sm text-body-sm">本周期</dt>
                  <dd className="font-data-mono text-on-surface m-0 text-[12px]">
                    {fmt(shop?.periodStart)} – {fmt(shop?.currentPeriodEnd)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-on-surface-variant font-body-sm text-body-sm">超额预估</dt>
                  <dd className={`font-data-mono m-0 text-[12px] ${aiOver ? 'text-error' : 'text-on-surface'}`}>
                    {aiOver ? `+$${overageUsd.toFixed(2)}` : '$0.00'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* 授权范围 —— 数据源 Shop.scopes，本轮新暴露 */}
            <div className={`col-span-12 lg:col-span-4 ${CARD}`}>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                授权范围
              </h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {Array.from(new Set([...REQUIRED_SCOPES, ...(shop?.scopes ?? [])])).map((sc) => {
                  const granted = shop?.scopes?.includes(sc) ?? false;
                  return (
                    <li
                      key={sc}
                      className={
                        granted
                          ? 'bg-surface-container-low border-outline-variant flex items-center justify-between rounded border p-2'
                          : 'bg-error-container/10 border-error/50 flex items-center justify-between rounded border p-2'
                      }
                    >
                      <span
                        className={`font-data-mono text-data-mono ${granted ? 'text-on-surface' : 'text-error'}`}
                      >
                        {sc}
                      </span>
                      {granted ? (
                        <CheckCircle2 className="text-primary h-4 w-4" aria-hidden="true" />
                      ) : (
                        <XCircle className="text-error h-4 w-4" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ul>
              {!shop?.scopes?.length ? (
                <p className="text-on-surface-variant m-0 mt-3 text-[11px]">
                  尚未记录授权范围（安装时未回写 scopes）
                </p>
              ) : null}
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

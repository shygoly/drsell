'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CreditCard,
  ExternalLink,
  LogOut,
  Package,
  ScrollText,
  ShieldAlert,
  Timer,
  User,
} from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import {
  clearToken,
  formatAuditAction,
  MERCHANT_APP_URL,
  opsFetch,
  type AuditLogPage,
  type ShopDetail,
} from '@/lib/api';

/**
 * /impersonation —— 对齐 Stitch 项目 11226504772808429506 屏 07
 * （Active Support Session / Impersonation）。进入商户端仍走外部窗口，但
 * 会话开始/结束、上下文与审计轨迹留在运营台内。
 */

function ImpersonationPage() {
  const params = useSearchParams();
  const shop = params.get('shop') ?? '';
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const reason = params.get('reason') ?? '—';
  const expiresIn = Number(params.get('expiresIn') ?? 0);

  const [detail, setDetail] = useState<ShopDetail | null>(null);
  const [audit, setAudit] = useState<AuditLogPage | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!shop) return;
    opsFetch<ShopDetail>(`/ops/shops/${encodeURIComponent(shop)}`)
      .then(setDetail)
      .catch(() => undefined);
    opsFetch<AuditLogPage>(
      `/ops/audit-logs?q=${encodeURIComponent(shop)}&limit=4&offset=0`,
    )
      .then(setAudit)
      .catch(() => undefined);
  }, [shop]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (!expiresIn) return null;
    const sec = Math.max(Math.floor((expiresIn * 1000 - (now % (expiresIn * 1000))) / 1000), 0);
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [expiresIn, now]);

  function openMerchant() {
    const url = new URL(MERCHANT_APP_URL);
    url.pathname = '/app';
    url.searchParams.set('shop', shop);
    url.searchParams.set('impersonation_token', token);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  const banner = (
    <div className="bg-amber-900 border-amber-500 flex h-16 w-full items-center gap-4 border-b px-[24px]">
      <span className="bg-amber-500 text-amber-900 font-label-caps text-label-caps flex h-10 shrink-0 items-center gap-2 px-3 uppercase">
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        Impersonation Active
      </span>
      <span className="text-amber-400 min-w-0 flex-1 truncate text-[13px]">
        Impersonating {email || '—'} for Store: {shop || '—'}
      </span>
      <span className="border-amber-500/40 text-on-surface-variant font-data-mono hidden shrink-0 border-l pl-4 text-[12px] lg:block">
        Reason: {reason}
      </span>
      <span className="text-on-surface-variant font-data-mono flex shrink-0 items-center gap-1.5 text-[12px]">
        <Timer className="h-4 w-4" aria-hidden="true" />
        Time remaining:
        <b className="text-on-surface text-[15px]">{remaining ?? '—'}</b>
      </span>
      <button
        type="button"
        onClick={() => {
          clearToken();
          window.location.href = '/login';
        }}
        className="bg-amber-500/20 border-amber-500 text-amber-400 hover:bg-amber-500 hover:text-amber-900 flex shrink-0 items-center gap-2 border px-3 py-2 text-[12px] font-bold uppercase transition-colors"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        End Session &amp; Logout
      </button>
    </div>
  );

  return (
    <AuthGate>
      <OpsShell active="impersonation" padded={false} banner={banner}>
        {/* 逐字移植自 designs/07_Active_Support_Session_(Impersonation).html 的 <main>。
            稿子那三张卡是商户业务数据（Total Revenue / Active Orders / Customers），
            /ops/* 无对应接口 —— 结构照搬，字段换成我们真有数据源的三项。
            左表同理：稿子是 Recent Orders，我们用店铺审计事件。 */}
        <main className="bg-background flex-1 overflow-y-auto p-[24px]">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Dashboard Header */}
            <div className="border-outline-variant flex items-end justify-between border-b pb-4">
              <div>
                <h1 className="font-display-sm text-display-sm text-on-surface m-0">
                  {shop || '—'} 支援会话
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant m-0 mt-1">
                  以商户视角排查问题，本会话全程写审计。
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={openMerchant}
                  className="bg-surface-container text-on-surface border-outline-variant hover:bg-surface-variant font-label-caps text-label-caps flex items-center gap-2 rounded border px-4 py-2 transition-colors"
                >
                  <ExternalLink className="h-[18px] w-[18px]" aria-hidden="true" />
                  进入商户端
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearToken();
                    window.location.href = '/login';
                  }}
                  className="bg-primary text-on-primary hover:bg-primary/90 font-label-caps text-label-caps flex items-center gap-2 rounded px-4 py-2 transition-colors"
                >
                  <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                  结束会话
                </button>
              </div>
            </div>

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-12 gap-[12px]">
            <div className="bg-primary-container border-outline-variant group relative col-span-12 overflow-hidden rounded border p-4 md:col-span-4">
              <div className="from-primary/5 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent" />
              <div className="relative z-10 mb-4 flex items-start justify-between">
                <div className="text-on-surface-variant font-body-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4" aria-hidden="true" /> 订阅状态
                </div>
              </div>
              <div className="font-display-sm text-display-sm text-on-surface relative z-10">{detail?.status?.toUpperCase() ?? '—'}</div>
              <div className="text-data-mono font-data-mono text-on-surface-variant/70 mt-2 text-[10px]">当前 Shopify 订阅状态</div>
            </div>
            <div className="bg-primary-container border-outline-variant group relative col-span-12 overflow-hidden rounded border p-4 md:col-span-4">
              <div className="from-secondary/5 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent" />
              <div className="relative z-10 mb-4 flex items-start justify-between">
                <div className="text-on-surface-variant font-body-sm flex items-center gap-2">
                  <Package className="h-4 w-4" aria-hidden="true" /> 套餐
                </div>
              </div>
              <div className="font-display-sm text-display-sm text-on-surface relative z-10">{detail?.planName ?? detail?.planCode ?? '—'}</div>
              <div className="text-data-mono font-data-mono text-on-surface-variant/70 mt-2 text-[10px]">本店计费套餐</div>
            </div>
            <div className="bg-primary-container border-outline-variant group relative col-span-12 overflow-hidden rounded border p-4 md:col-span-4">
              <div className="from-tertiary/5 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent" />
              <div className="relative z-10 mb-4 flex items-start justify-between">
                <div className="text-on-surface-variant font-body-sm flex items-center gap-2">
                  <User className="h-4 w-4" aria-hidden="true" /> 归属
                </div>
              </div>
              <div className="font-display-sm text-display-sm text-on-surface relative z-10">{detail?.ownerEmail ?? '—'}</div>
              <div className="text-data-mono font-data-mono text-on-surface-variant/70 mt-2 text-[10px]">账号所有者</div>
            </div>

              {/* Recent Events Table (Dense) */}
              <div className="bg-surface-container border-outline-variant col-span-12 flex flex-col rounded border lg:col-span-8">
                <div className="border-outline-variant flex items-center justify-between border-b p-4">
                  <h2 className="font-headline-md text-headline-md text-on-surface m-0">最近店铺事件</h2>
                  <Link href="/audit" className="text-primary font-body-sm no-underline hover:underline">
                    全部
                  </Link>
                </div>
                <div className="flex-1 overflow-x-auto">
                  <table className="font-body-sm w-full text-left">
                    <thead className="text-on-surface-variant font-label-caps text-label-caps border-outline-variant bg-surface-container-highest sticky top-0 border-b">
                      <tr>
                        <th className="px-4 py-2 font-medium">时间</th>
                        <th className="px-4 py-2 font-medium">操作者</th>
                        <th className="px-4 py-2 font-medium">动作</th>
                        <th className="px-4 py-2 text-right font-medium">结果</th>
                      </tr>
                    </thead>
                    <tbody className="divide-outline-variant/50 divide-y">
                      {(audit?.items ?? []).map((row) => {
                        const failed = row.result !== 'ok';
                        return (
                          <tr
                            key={row.id}
                            className={`hover:bg-surface-variant/50 h-[32px] transition-colors${failed ? ' bg-error/5' : ''}`}
                          >
                            <td className="font-data-mono text-primary px-4 py-1">
                              {row.createdAt.slice(11, 19)}
                            </td>
                            <td className="text-on-surface px-4 py-1">{row.actorEmail}</td>
                            <td className="px-4 py-1">
                              <span
                                className={
                                  failed
                                    ? 'bg-error/10 text-error font-label-caps inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px]'
                                    : 'bg-primary/10 text-primary font-label-caps inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px]'
                                }
                              >
                                <span className={failed ? 'bg-error h-1.5 w-1.5 rounded-full' : 'bg-primary h-1.5 w-1.5 rounded-full'} />
                                {formatAuditAction(row.action)}
                              </span>
                            </td>
                            <td className="font-data-mono px-4 py-1 text-right">
                              {failed ? 'FAIL' : 'OK'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Admin Audit Context Pane */}
              <div className="bg-surface-container-highest border-amber-500/50 relative col-span-12 flex flex-col overflow-hidden rounded border shadow-[0_0_15px_rgba(245,158,11,0.05)] lg:col-span-4">
                <div className="from-amber-500/0 via-amber-500 to-amber-500/0 absolute left-0 top-0 h-1 w-full bg-gradient-to-r opacity-50" />
                <div className="border-outline-variant bg-surface-container-low flex items-center justify-between border-b p-4">
                  <h2 className="font-headline-md text-headline-md text-amber-500 m-0 flex items-center gap-2">
                    <ShieldAlert className="h-[18px] w-[18px]" aria-hidden="true" />
                    Impersonation Context
                  </h2>
                </div>
                <div className="flex-1 space-y-4 p-4">
                  <div className="bg-surface-container border-outline-variant text-body-sm rounded border p-3">
                    <div className="text-on-surface-variant font-label-caps mb-1">Target Merchant</div>
                    <div className="font-data-mono text-on-surface text-[11px]">Store: {shop || '—'}</div>
                    <div className="mt-1 font-medium">{email || '—'}</div>
                  </div>
                  <div>
                    <div className="text-on-surface-variant font-label-caps mb-2">
                      Live Audit Trail
                    </div>
                    <div className="bg-canvas-deep border-card-border font-data-mono text-on-surface-variant/80 h-32 space-y-1 overflow-y-auto rounded border p-2 text-[10px]">
                      <div className="flex gap-2">
                        <span className="text-primary">[{remaining ?? '--:--'}]</span>
                        <span>SESSION_START</span>
                        <span className="text-on-surface truncate">INIT IMPERSONATION → {shop || '—'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-primary">[{remaining ?? '--:--'}]</span>
                        <span>ACTOR</span>
                        <span className="text-on-surface truncate">{email || '—'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-primary">[{remaining ?? '--:--'}]</span>
                        <span>REASON</span>
                        <span className="text-amber-400 truncate">{reason}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-primary">[{remaining ?? '--:--'}]</span>
                        <span className="animate-pulse text-amber-500">AWAITING_INPUT</span>
                        <span className="text-on-surface">...</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href="/audit"
                    className="bg-surface-container hover:bg-surface-variant border-outline-variant text-on-surface font-label-caps text-label-caps mt-auto flex w-full items-center justify-center gap-2 rounded border py-2 no-underline transition-colors"
                  >
                    <ScrollText className="h-4 w-4" aria-hidden="true" />
                    查看完整审计日志
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </OpsShell>
    </AuthGate>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <ImpersonationPage />
    </Suspense>
  );
}

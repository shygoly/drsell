'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ExternalLink, LogOut, ShieldAlert, Timer } from 'lucide-react';
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
      `/ops/audit-logs?q=${encodeURIComponent(shop)}&action=shop.impersonate&limit=6&offset=0`,
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
    <div className="bg-amber-900/30 border-amber-500 flex h-16 w-full items-center gap-4 border-b px-[24px]">
      <span className="bg-amber-500 text-amber-900 font-label-caps text-label-caps flex shrink-0 items-center gap-2 px-3 py-1.5 uppercase">
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
        <div className="flex min-h-full flex-col gap-4 overflow-auto p-4 md:p-6">
          {/* 店铺概览 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="bg-primary-container border-outline-variant rounded-lg border p-4">
              <div className="text-on-surface-variant font-label-caps mb-1 text-[10px] uppercase">
                Subscription Status
              </div>
              <div className="text-on-surface font-display text-2xl font-bold">
                {detail?.status?.toUpperCase() ?? '—'}
              </div>
            </div>
            <div className="bg-primary-container border-outline-variant rounded-lg border p-4">
              <div className="text-on-surface-variant font-label-caps mb-1 text-[10px] uppercase">
                Plan
              </div>
              <div className="text-on-surface font-data-mono text-sm">
                {detail?.planName ?? detail?.planCode ?? '—'}
              </div>
            </div>
            <div className="bg-primary-container border-outline-variant rounded-lg border p-4">
              <div className="text-on-surface-variant font-label-caps mb-1 text-[10px] uppercase">
                Owner
              </div>
              <div className="text-on-surface font-data-mono text-sm">
                {detail?.ownerEmail ?? '—'}
              </div>
            </div>
          </div>

          {/* 稿子屏 07：左宽表 + 右 Impersonation Context */}
          <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="bg-primary-container border-outline-variant rounded-lg border lg:col-span-2">
              <div className="border-outline-variant flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-on-surface m-0 text-sm font-bold">最近店铺事件</h2>
                <Link href="/audit" className="text-secondary text-[12px] no-underline">
                  View All
                </Link>
              </div>
              <div className="flex flex-col">
                {(audit?.items ?? []).map((row) => (
                  <div
                    key={row.id}
                    className="border-outline-variant font-data-mono text-on-surface-variant flex items-center justify-between gap-3 border-b px-4 py-2.5 text-[12px] last:border-b-0"
                  >
                    <span className="text-on-surface shrink-0">
                      {row.createdAt.slice(0, 19).replace('T', ' ')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right">
                      {row.actorEmail} · {formatAuditAction(row.action)}
                    </span>
                    <span
                      className={
                        row.result === 'ok'
                          ? 'text-on-surface-variant w-10 shrink-0 text-right'
                          : 'text-error w-10 shrink-0 text-right font-bold'
                      }
                    >
                      {row.result === 'ok' ? 'OK' : 'FAIL'}
                    </span>
                  </div>
                ))}
                {!audit?.items.length ? (
                  <div className="text-on-surface-variant px-4 py-6 text-[12px]">
                    暂无代登录审计记录
                  </div>
                ) : null}
              </div>
            </div>

            <div className="bg-primary-container border-amber-500 rounded-lg border">
              <h2 className="text-amber-400 border-outline-variant m-0 flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                Impersonation Context
              </h2>
              <div className="flex flex-col gap-4 p-4">
                <div className="border-outline-variant bg-surface-container-high rounded border p-3">
                  <div className="text-on-surface-variant font-label-caps mb-1 text-[10px] uppercase">
                    Target Merchant
                  </div>
                  <div className="font-data-mono text-on-surface-variant text-[11px]">
                    Store: {shop || '—'}
                  </div>
                  <div className="text-on-surface mt-1 text-[13px]">{email || '—'}</div>
                </div>
                <div>
                  <div className="text-on-surface mb-2 text-[13px]">Live Audit Trail</div>
                  <pre className="border-outline-variant bg-background text-on-surface-variant m-0 overflow-x-auto rounded border p-3 font-data-mono text-[11px] leading-relaxed">
{`[${remaining ?? '--:--'}] SESSION_START  INIT IMPERSONATION → ${shop || '—'}
[${remaining ?? '--:--'}] ACTOR          ${email || '—'}
[${remaining ?? '--:--'}] REASON         ${reason}
[${remaining ?? '--:--'}] AWAITING_INPUT ...`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
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

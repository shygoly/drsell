'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
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

  return (
    <AuthGate>
      <OpsShell active="impersonation" padded={false}>
        <div className="flex min-h-full flex-col gap-4 overflow-auto p-4 md:p-6">
          {/* IMPERSONATION ACTIVE 条 */}
          <div className="border-outline-variant bg-primary-container flex flex-col items-start justify-between gap-3 rounded-lg border p-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <ShieldAlert className="text-error h-5 w-5" aria-hidden="true" />
              <div>
                <div className="text-on-surface font-label-caps text-[10px] uppercase tracking-wider">
                  IMPERSONATION ACTIVE
                </div>
                <div className="text-on-surface font-data-mono text-[13px]">
                  Impersonating {email || '—'} for Store: {shop || '—'}
                  {reason !== '—' ? ` · Reason: ${reason}` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {remaining ? (
                <span className="text-on-surface-variant font-data-mono flex items-center gap-1.5 text-[12px]">
                  <Timer className="h-4 w-4" aria-hidden="true" />
                  Time remaining: {remaining}
                </span>
              ) : null}
              <button
                type="button"
                onClick={openMerchant}
                className="bg-primary text-on-primary border-primary hover:bg-surface-container-high hover:text-primary flex h-8 items-center gap-2 border px-3 text-[10px] font-bold uppercase transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                进入商户端
              </button>
              <button
                type="button"
                onClick={() => {
                  clearToken();
                  window.location.href = '/login';
                }}
                className="border-outline-variant text-on-surface-variant hover:text-error flex h-8 items-center gap-2 border px-3 text-[10px] font-bold uppercase transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                End Session &amp; Logout
              </button>
            </div>
          </div>

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

          {/* Live Audit Trail */}
          <div className="bg-primary-container border-outline-variant flex-1 rounded-lg border p-4">
            <h2 className="text-on-surface mb-3 flex items-center gap-2 border-b border-outline-variant pb-2 text-sm font-bold">
              <ShieldAlert className="text-secondary h-4 w-4" aria-hidden="true" />
              Live Audit Trail
            </h2>
            <div className="flex flex-col gap-2">
              {(audit?.items ?? []).map((row) => (
                <div
                  key={row.id}
                  className="border-outline-variant text-on-surface-variant flex items-center justify-between gap-3 border-b pb-2 font-data-mono text-[12px]"
                >
                  <span className="text-on-surface">
                    {row.createdAt.slice(0, 19).replace('T', ' ')}
                  </span>
                  <span className="truncate">
                    {row.actorEmail} · {formatAuditAction(row.action)}
                  </span>
                  <span className={row.result === 'ok' ? 'text-on-surface-variant' : 'text-error font-bold'}>
                    {row.result === 'ok' ? 'OK' : 'FAIL'}
                  </span>
                </div>
              ))}
              {!audit?.items.length ? (
                <div className="text-on-surface-variant text-[12px]">暂无代登录审计记录</div>
              ) : null}
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

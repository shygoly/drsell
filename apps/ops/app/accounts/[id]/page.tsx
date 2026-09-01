'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, History, KeyRound, Link2, LogIn, Store, User } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import {
  formatAuditAction,
  ImpersonateResult,
  openImpersonationSession,
  opsFetch,
  type AccountSummary,
} from '@/lib/api';

const STAT_LABEL = 'font-label-caps text-label-caps text-on-surface-variant mb-1 uppercase';
const CELL = 'font-data-mono text-data-mono border-outline-variant flex items-center border-r px-3';
const HEAD =
  'font-label-caps text-label-caps text-on-surface-variant border-outline-variant flex items-center border-r px-3 py-2 uppercase';
const SHOP_GRID = 'grid grid-cols-[2fr_1fr_1fr_1fr_1fr]';

function fmtDate(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : '—';
}

function relTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return '刚刚';
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState('');
  const [id, setId] = useState('');

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  const reload = useCallback(() => {
    if (!id) return;
    opsFetch<AccountSummary>(`/ops/accounts/${id}`)
      .then(setAccount)
      .catch((e) => setError(String(e.message ?? e)));
  }, [id]);

  useEffect(reload, [reload]);

  async function impersonate(domain: string) {
    const res = await opsFetch<ImpersonateResult>(
      `/ops/shops/${encodeURIComponent(domain)}/impersonate`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    openImpersonationSession(res);
  }

  const shops = account?.shops ?? [];
  const earliest = shops
    .map((s) => s.installedAt)
    .filter(Boolean)
    .sort()[0];

  return (
    <AuthGate>
      <OpsShell active="accounts" padded={false}>
        <div className="max-w-[1280px] mx-auto flex w-full flex-1 flex-col gap-6 overflow-auto p-[16px] md:p-6 lg:p-8">
          {error ? <p className="text-error text-sm">{error}</p> : null}

          {/* 账号头卡 */}
          <div className="bg-card-surface border-outline-variant relative border">
            <div className="absolute right-[16px] top-[16px] z-10">
              <button
                type="button"
                onClick={() => shops[0] && impersonate(shops[0].shopDomain)}
                disabled={!shops.length}
                className="bg-primary text-on-primary border-outline-variant font-label-caps text-label-caps hover:bg-card-surface hover:text-on-surface flex items-center gap-2 border px-4 py-2 uppercase transition-colors disabled:opacity-40"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                代登录
              </button>
            </div>
            <div className="border-outline-variant flex flex-col items-start gap-6 border-b p-6 md:flex-row md:items-center md:p-8">
              <div className="bg-surface border-outline-variant flex h-20 w-20 shrink-0 items-center justify-center border">
                <User className="text-on-surface h-10 w-10" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-headline-lg text-headline-lg text-on-surface m-0 mb-1">
                  {account?.email ?? '…'}
                </h2>
                <div className="font-data-mono text-data-mono text-on-surface-variant flex flex-wrap items-center gap-2">
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{account?.authProvider === 'google' ? 'Google 登录' : '邮箱登录'}</span>
                  <span className="bg-primary mx-2 h-1 w-1 rounded-full" />
                  <span>ID: {account?.id ?? '—'}</span>
                  <span className="bg-surface text-on-surface-variant font-label-caps border-outline-variant ml-2 border px-2 py-0.5 text-[9px] uppercase">
                    {account?.role ?? '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* 四格指标。Risk Score 与 Total Billed 不做 —— 前者无数据源，后者口径未定。 */}
            <div className="divide-outline-variant border-outline-variant bg-surface-container-low grid grid-cols-2 divide-x divide-y border-t md:grid-cols-4 md:divide-y-0">
              <div className="p-4">
                <div className={STAT_LABEL}>名下店铺</div>
                <div className="font-headline-md text-headline-md text-on-surface">{shops.length}</div>
              </div>
              <div className="p-4">
                <div className={STAT_LABEL}>安装最早</div>
                <div className="font-data-mono text-headline-sm text-on-surface">{fmtDate(earliest)}</div>
              </div>
              <div className="p-4">
                <div className={STAT_LABEL}>最近登录</div>
                <div className="font-data-mono text-headline-sm text-on-surface">
                  {relTime(account?.lastLoginAt)}
                </div>
              </div>
              <div className="p-4">
                <div className={STAT_LABEL}>注册于</div>
                <div className="font-data-mono text-headline-sm text-on-surface">
                  {fmtDate(account?.createdAt)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* 名下店铺 */}
            <div className="bg-card-surface border-outline-variant flex flex-col border lg:col-span-2">
              <div className="border-outline-variant bg-surface flex items-center justify-between border-b p-2">
                <h3 className="font-label-caps text-label-caps text-on-surface m-0 flex items-center gap-2 px-2 uppercase">
                  <Store className="h-4 w-4" aria-hidden="true" />
                  名下店铺
                </h3>
              </div>
              <div className={`${SHOP_GRID} border-outline-variant bg-surface-container-low border-b`}>
                <div className={HEAD}>店铺 (SHOP)</div>
                <div className={HEAD}>角色 (ROLE)</div>
                <div className={HEAD}>订阅 (SUBSCRIPTION)</div>
                <div className={HEAD}>计费店 (BILLING)</div>
                <div className={`${HEAD} border-r-0`}>安装时间 (INSTALLED)</div>
              </div>
              {shops.map((s) => (
                <div
                  key={s.shopDomain}
                  className={`${SHOP_GRID} border-outline-variant hover:bg-surface-container-low border-b transition-colors last:border-b-0`}
                >
                  <div className={`${CELL} truncate`}>
                    <Link href={`/shops/${encodeURIComponent(s.shopDomain)}`}>{s.shopDomain}</Link>
                  </div>
                  <div className={CELL}>{s.role === 'owner' ? '安装者' : '坐席'}</div>
                  <div className={CELL}>
                    <span
                      className={
                        (s.status ?? '').toUpperCase() === 'FROZEN'
                          ? 'bg-frozen-accent text-on-primary font-label-caps text-label-caps border-outline-variant inline-flex items-center border px-2 py-0.5'
                          : 'bg-surface text-on-surface-variant font-label-caps text-label-caps border-outline-variant inline-flex items-center border px-2 py-0.5'
                      }
                    >
                      {(s.status ?? '—').toUpperCase()}
                    </span>
                  </div>
                  {/* 不做成 checkbox —— 切换计费店是带审计的写操作，在店铺详情页完成 */}
                  <div className={`${CELL} justify-center`} title={s.isBillingShop ? '收全额' : '$0'}>
                    {s.isBillingShop ? <Check className="h-4 w-4" aria-hidden="true" /> : '—'}
                  </div>
                  <div className={`${CELL} border-r-0`}>{fmtDate(s.installedAt)}</div>
                </div>
              ))}
              {!shops.length ? (
                <div className="text-on-surface-variant px-3 py-6 text-center text-[13px]">
                  该账号名下暂无店铺
                </div>
              ) : null}
            </div>

            {/* 最近操作 */}
            <div className="bg-card-surface border-outline-variant flex flex-col border">
              <div className="border-outline-variant bg-surface flex items-center justify-between border-b p-2">
                <h3 className="font-label-caps text-label-caps text-on-surface m-0 flex items-center gap-2 px-2 uppercase">
                  <History className="h-4 w-4" aria-hidden="true" />
                  最近操作
                </h3>
                <Link
                  href="/audit"
                  className="font-label-caps text-label-caps text-on-surface-variant px-2 uppercase"
                >
                  全部
                </Link>
              </div>
              <div className="divide-outline-variant/15 flex flex-col divide-y">
                {(account?.auditPreview ?? []).map((row) => (
                  <div key={row.id} className="flex items-start gap-3 p-3">
                    <span className="border-outline-variant bg-surface flex h-8 w-8 shrink-0 items-center justify-center border">
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-data-mono text-on-surface text-[13px]">
                        {formatAuditAction(row.action)}
                      </span>
                      <span className="font-data-mono text-on-surface-variant text-[11px]">
                        {row.actorEmail} · {relTime(row.createdAt)}
                        {row.result !== 'ok' ? (
                          <span className="text-error font-bold"> · 失败</span>
                        ) : null}
                      </span>
                    </span>
                  </div>
                ))}
                {!account?.auditPreview?.length ? (
                  <div className="text-on-surface-variant p-3 text-[13px]">暂无操作记录</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </OpsShell>
    </AuthGate>
  );
}

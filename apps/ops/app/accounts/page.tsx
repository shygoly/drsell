'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Copy, Search, ShieldCheck, Store, UserCog } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { opsFetch, type AccountSummary, type ShopDetail } from '@/lib/api';

/**
 * /accounts —— 对齐 Stitch 项目 11226504772808429506 屏 02
 * （Accounts & Membership Overview）。只展示真实数据：
 * 邮箱/店铺域名/账号 ID 三路查询；无 2FA / 登录 IP / 地区数据，就显示 — 不造假。
 */

type AccountRow = { id: string; email: string; role: string };

type EnrichedRow = AccountRow & {
  totalShops?: number;
  lastLoginAt?: string | null;
  createdAt?: string;
  totalMonthlyBillUsd?: number;
};

type LookupType = 'email' | 'domain' | 'uuid';

const LOOKUP_TYPES: Array<{ value: LookupType; label: string }> = [
  { value: 'email', label: 'Email / Exact Match' },
  { value: 'domain', label: 'Domain Pattern (*@domain.com)' },
  { value: 'uuid', label: 'User ID (UUID)' },
];

const TH =
  'text-on-surface-variant font-label-caps px-4 py-2 text-left text-[10px] font-medium uppercase';
const TD = 'px-4 py-2';

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

export default function AccountsPage() {
  const [lookup, setLookup] = useState<LookupType>('email');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [shopDomain, setShopDomain] = useState('');
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccountSummary | null>(null);
  const [shopDetails, setShopDetails] = useState<Record<string, ShopDetail>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  async function executeSearch(e?: FormEvent) {
    e?.preventDefault();
    const prefix = q.trim();
    if (!prefix) return;
    setBusy(true);
    setError('');
    setRows([]);
    setShopDomain('');
    setSelectedId(null);
    setDetail(null);
    setShopDetails({});
    setSearched(true);
    setQueryTime(null);
    const started = performance.now();
    try {
      let raw: AccountRow[] = [];
      if (lookup === 'email') {
        raw = await opsFetch<AccountRow[]>(`/ops/accounts?q=${encodeURIComponent(prefix)}`);
      } else if (lookup === 'domain') {
        const data = await opsFetch<{ shopDomain: string; accounts: AccountRow[] }>(
          `/ops/accounts/by-shop/${encodeURIComponent(prefix)}`,
        );
        setShopDomain(data.shopDomain);
        raw = data.accounts;
      } else {
        const data = await opsFetch<{ id: string; email: string; role: string }>(
          `/ops/accounts/${encodeURIComponent(prefix)}`,
        );
        raw = [{ id: data.id, email: data.email, role: data.role }];
      }
      setQueryTime(Math.round((performance.now() - started) * 100) / 100);
      // 丰富表格列：Stores / Last Seen / Created / MRR 需要账号详情
      const enriched = await Promise.all(
        raw.slice(0, 20).map(async (row) => {
          try {
            const d = await opsFetch<AccountSummary>(`/ops/accounts/${encodeURIComponent(row.id)}`);
            return {
              ...row,
              totalShops: d.totalShops ?? d.shops.length,
              lastLoginAt: d.lastLoginAt,
              createdAt: d.createdAt,
              totalMonthlyBillUsd: d.totalMonthlyBillUsd,
            };
          } catch {
            return row;
          }
        }),
      );
      setRows(enriched);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(row: EnrichedRow) {
    setSelectedId(row.id);
    setDetail(null);
    setShopDetails({});
    try {
      const data = await opsFetch<AccountSummary>(`/ops/accounts/${encodeURIComponent(row.id)}`);
      setDetail(data);
      const byDomain = await Promise.all(
        data.shops.map(async (s) => {
          try {
            const sd = await opsFetch<ShopDetail>(`/ops/shops/${encodeURIComponent(s.shopDomain)}`);
            return [s.shopDomain, sd] as const;
          } catch {
            return null;
          }
        }),
      );
      setShopDetails(
        Object.fromEntries(byDomain.filter((x): x is readonly [string, ShopDetail] => x !== null)),
      );
    } catch (err) {
      setError(String((err as Error).message));
    }
  }

  function copyId(id: string) {
    navigator.clipboard?.writeText(id);
  }

  return (
    <AuthGate>
      <OpsShell chrome="both" active="accounts" padded={false}>
        {/* 逐字移植自 Stitch 02 的 <main> 外框：p-container-padding(24) / gap-6 / 深画布 */}
        <main className="bg-canvas-deep relative flex flex-col gap-6 p-[24px]">
          <div className="from-primary/5 pointer-events-none absolute right-0 top-0 h-64 w-1/2 bg-gradient-to-bl to-transparent" />

          {/* Page Header */}
          <div className="border-outline-variant relative z-10 flex flex-col items-start justify-between gap-4 border-b pb-4 md:flex-row md:items-end">
            <div>
              <h1 className="font-display-sm text-display-sm text-on-surface m-0 mb-1 flex items-center gap-3">
                <UserCog className="text-primary h-7 w-7" aria-hidden="true" />
                账号检索与目录
              </h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
                Global directory for merchant accounts, cross-store roles, and billing designation.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 items-start gap-6 xl:grid-cols-12">
            {/* 左：Lookup + 结果表 */}
            <div className="col-span-12 flex h-full flex-col gap-4 xl:col-span-7">
              <div className="bg-primary-container border-outline-variant rounded-lg border p-4 shadow-sm">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-0 flex-1">
                    <span className="text-on-primary-container font-label-caps mb-2 block text-[10px] uppercase">
                      Global Lookup
                    </span>
                    <div className="relative">
                      <Search
                        className="text-on-surface-variant group-focus-within:text-primary pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void executeSearch();
                        }}
                        placeholder={
                          lookup === 'email'
                            ? 'admin@example.com'
                            : lookup === 'domain'
                              ? 'shop.myshopify.com'
                              : 'acc_… 或 uuid'
                        }
                        className="bg-background border-primary/50 font-data-mono text-on-surface focus:border-primary h-10 w-full border py-2 pr-4 pl-10 text-[12px] outline-none"
                      />
                    </div>
                  </label>
                  <label className="w-full md:w-auto">
                    <span className="text-on-primary-container font-label-caps mb-2 block text-[10px] uppercase">
                      Lookup Type
                    </span>
                    <select
                      value={lookup}
                      onChange={(e) => setLookup(e.target.value as LookupType)}
                      className="bg-background border-outline-variant font-body-sm text-on-surface focus:border-primary h-10 w-full border px-3 py-2 text-[13px] outline-none"
                    >
                      {LOOKUP_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void executeSearch()}
                    disabled={busy || !q.trim()}
                    className="bg-primary text-on-primary hover:bg-primary-fixed font-label-caps h-10 border px-6 text-[10px] uppercase transition-colors disabled:opacity-50"
                  >
                    执行检索
                  </button>
                </div>
              </div>

              {error ? (
                <p className="text-error text-sm" role="alert">
                  {error}
                </p>
              ) : null}

              {shopDomain ? (
                <p className="text-on-surface-variant font-data-mono m-0 text-[12px]">
                  命中店铺：{shopDomain}
                </p>
              ) : null}

              <div className="bg-primary-container border-outline-variant flex flex-1 flex-col overflow-hidden rounded-lg border shadow-sm">
                <div className="border-outline-variant flex items-center justify-between border-b px-4 py-3">
                  <h2 className="text-primary font-label-caps m-0 flex items-center gap-2 text-[10px] uppercase">
                    <Search className="h-4 w-4" aria-hidden="true" />
                    {rows.length} Matches Found
                  </h2>
                  <span className="text-on-surface-variant font-data-mono text-[10px]">
                    {queryTime !== null ? `Query time: ${queryTime}ms` : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left">
                    <thead className="border-outline-variant sticky top-0 z-10 border-b">
                      <tr>
                        <th className={TH}>Account / Email</th>
                        <th className={TH}>Auth</th>
                        <th className={`${TH} text-center`}>Stores</th>
                        <th className={TH}>Security</th>
                        <th className={`${TH} text-right`}>Last Seen</th>
                        <th className={`${TH} text-right`}>详情</th>
                      </tr>
                    </thead>
                    <tbody className="font-data-mono text-on-surface divide-outline-variant text-[12px] divide-y">
                      {rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`hover:bg-surface-container-high cursor-pointer transition-colors ${
                            selectedId === row.id ? 'bg-surface-container-high' : ''
                          }`}
                          onClick={() => void openDetail(row)}
                        >
                          <td className={TD}>
                            <div className="flex items-center gap-2">
                              <div className="border-outline-variant bg-surface-container-high flex h-6 w-6 items-center justify-center rounded-full border">
                                <span className="text-on-surface font-body-sm text-[11px] font-bold">
                                  {row.email.slice(0, 1).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-primary font-medium">{row.email}</span>
                            </div>
                          </td>
                          <td className={TD}>
                            <span className="text-on-surface-variant">{row.role || '—'}</span>
                          </td>
                          <td className={`${TD} text-center`}>
                            <span className="bg-secondary-container text-on-secondary-container border-outline-variant rounded border px-2 py-0.5 text-[10px]">
                              {row.totalShops ?? '—'}
                            </span>
                          </td>
                          <td className={TD}>
                            <span className="text-on-surface-variant flex items-center gap-1">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              —
                            </span>
                          </td>
                          <td className={`${TD} text-on-surface-variant text-right text-[11px]`}>
                            {relTime(row.lastLoginAt)}
                          </td>
                          <td className={`${TD} text-right`}>
                            <Link
                              href={`/accounts/${row.id}`}
                              className="text-on-surface-variant hover:text-primary inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              打开
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {!rows.length && searched && !error ? (
                        <tr>
                          <td colSpan={6} className={`${TD} text-on-surface-variant text-center`}>
                            无匹配账号
                          </td>
                        </tr>
                      ) : null}
                      {!searched && !error ? (
                        <tr>
                          <td colSpan={6} className={`${TD} text-on-surface-variant text-center`}>
                            输入邮箱前缀、店铺域名或账号 ID 后执行检索
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 右：Membership Panopticon */}
            <div className="col-span-12 xl:col-span-5">
              <div className="bg-primary-container border-outline-variant flex h-full min-h-[520px] flex-col overflow-hidden rounded-lg border shadow-sm">
                {!detail ? (
                  <div className="flex flex-1 items-center justify-center p-6">
                    <p className="text-on-surface-variant font-data-mono m-0 text-[12px]">
                      {selectedId ? '加载中…' : '点击左侧账号查看跨店身份与计费归属。'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="border-outline-variant flex flex-col gap-4 border-b p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="border-primary/50 bg-primary-container flex h-12 w-12 items-center justify-center rounded border">
                            <span className="text-primary font-headline-md text-[18px] font-bold">
                              {detail.email.slice(0, 1).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-display-sm text-on-surface m-0 text-[18px] font-bold leading-tight">
                              {detail.email}
                            </h3>
                            <div className="text-on-surface-variant font-data-mono mt-1 flex items-center gap-2 text-[11px]">
                              <span>ID: {detail.id}</span>
                              <button
                                type="button"
                                onClick={() => copyId(detail.id)}
                                className="hover:text-primary transition-colors"
                                aria-label="复制 ID"
                              >
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <span className="bg-primary/10 text-primary border-primary/30 font-label-caps flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase">
                          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          {detail.role || 'ADMIN'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-surface-container-low border-outline-variant rounded border p-2">
                          <span className="text-on-surface-variant font-label-caps mb-1 block text-[9px] uppercase">
                            Created
                          </span>
                          <span className="font-data-mono text-on-surface text-[11px]">
                            {fmtDate(detail.createdAt)}
                          </span>
                        </div>
                        <div className="bg-surface-container-low border-outline-variant rounded border p-2">
                          <span className="text-on-surface-variant font-label-caps mb-1 block text-[9px] uppercase">
                            Location
                          </span>
                          <span className="font-data-mono text-on-surface text-[11px]">—</span>
                        </div>
                        <div className="bg-surface-container-low border-outline-variant rounded border p-2">
                          <span className="text-on-surface-variant font-label-caps mb-1 block text-[9px] uppercase">
                            Total MRR
                          </span>
                          <span className="text-secondary font-data-mono text-[11px] font-bold">
                            ${(detail.totalMonthlyBillUsd ?? 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-on-surface-variant font-label-caps m-0 flex items-center gap-2 text-[10px] uppercase">
                          <Store className="h-4 w-4" aria-hidden="true" />
                          Membership Panopticon ({detail.shops.length} Stores)
                        </h4>
                      </div>
                      <div className="flex flex-col gap-4">
                        {detail.shops.map((s) => {
                          const sd = shopDetails[s.shopDomain];
                          return (
                            <div
                              key={s.shopDomain}
                              className="bg-surface-container-low border-primary/40 hover:border-primary relative rounded-lg border p-4 transition-colors"
                            >
                              {s.isBillingShop ? (
                                <span className="bg-primary text-on-primary font-label-caps absolute top-0 right-0 rounded-bl px-2 py-0.5 text-[9px] uppercase">
                                  BILLING
                                </span>
                              ) : null}
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="border-outline-variant bg-background flex h-8 w-8 shrink-0 items-center justify-center rounded border">
                                    <Store className="text-on-surface-variant h-4 w-4" aria-hidden="true" />
                                  </div>
                                  <div>
                                    <div className="text-on-surface font-body-sm text-[14px] font-bold">
                                      {s.shopDomain.replace('.myshopify.com', '')}
                                    </div>
                                    <Link
                                      href={`/shops/${encodeURIComponent(s.shopDomain)}`}
                                      className="text-on-surface-variant font-data-mono mt-0.5 block text-[10px]"
                                    >
                                      {s.shopDomain}
                                    </Link>
                                  </div>
                                </div>
                              </div>
                              <div className="border-outline-variant grid grid-cols-2 gap-2 border-t pt-3">
                                <div>
                                  <span className="text-on-surface-variant font-label-caps text-[9px] uppercase">
                                    Account Role
                                  </span>
                                  <div className="text-on-surface font-data-mono mt-1 text-[11px]">
                                    {s.role}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-on-surface-variant font-label-caps text-[9px] uppercase">
                                    Plan Tier
                                  </span>
                                  <div className="text-on-surface font-data-mono mt-1 text-[11px]">
                                    {sd?.planName ?? sd?.planCode ?? '—'}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-on-surface-variant font-label-caps text-[9px] uppercase">
                                    Subscription
                                  </span>
                                  <div className="text-on-surface font-data-mono mt-1 text-[11px]">
                                    {(s.status ?? '—').toUpperCase()}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-on-surface-variant font-label-caps text-[9px] uppercase">
                                    Installed
                                  </span>
                                  <div className="text-on-surface font-data-mono mt-1 text-[11px]">
                                    {fmtDate(s.installedAt)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </OpsShell>
    </AuthGate>
  );
}

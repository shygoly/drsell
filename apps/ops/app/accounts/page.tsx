'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, Store, User } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { opsFetch, type AccountSummary } from '@/lib/api';

/**
 * /accounts —— 对齐 Stitch 项目 11226504772808429506 屏 02（Accounts & Membership Overview）。
 * 左：Global Lookup + 结果表；右：选中账号的 Membership Panopticon。
 * 只做真实数据：邮箱前缀、店铺域名、账号 ID 三路查询。
 */

type AccountRow = { id: string; email: string; role: string };

type LookupType = 'email' | 'domain' | 'uuid';

const LOOKUP_TYPES: Array<{ value: LookupType; label: string }> = [
  { value: 'email', label: 'Email / 前缀匹配' },
  { value: 'domain', label: '店铺域名' },
  { value: 'uuid', label: 'User ID (UUID)' },
];

const TH =
  'text-on-surface-variant font-label-caps px-3 py-2 text-left text-[10px] uppercase';
const TD = 'px-3 py-2';

export default function AccountsPage() {
  const [lookup, setLookup] = useState<LookupType>('email');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [shopDomain, setShopDomain] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccountSummary | null>(null);
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
    setSearched(true);
    try {
      if (lookup === 'email') {
        const data = await opsFetch<AccountRow[]>(`/ops/accounts?q=${encodeURIComponent(prefix)}`);
        setRows(data);
      } else if (lookup === 'domain') {
        const data = await opsFetch<{ shopDomain: string; accounts: AccountRow[] }>(
          `/ops/accounts/by-shop/${encodeURIComponent(prefix)}`,
        );
        setShopDomain(data.shopDomain);
        setRows(data.accounts);
      } else {
        const data = await opsFetch<{ id: string; email: string; role: string }>(
          `/ops/accounts/${encodeURIComponent(prefix)}`,
        );
        setRows([{ id: data.id, email: data.email, role: data.role }]);
      }
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    try {
      const data = await opsFetch<AccountSummary>(`/ops/accounts/${encodeURIComponent(id)}`);
      setDetail(data);
    } catch (err) {
      setError(String((err as Error).message));
    }
  }

  return (
    <AuthGate>
      <OpsShell
        chrome="both"
        active="accounts"
        title="Account Search & Directory"
        subtitle="Global directory for merchant accounts, cross-store roles, and billing designation."
      >
        <div className="grid grid-cols-12 gap-4">
          {/* 左：Lookup + 结果表 */}
          <div className="col-span-12 flex flex-col gap-4 xl:col-span-8">
            <div className="bg-primary-container border-outline-variant rounded-lg border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-on-surface-variant font-label-caps text-[10px] uppercase">
                    Lookup Type
                  </span>
                  <select
                    value={lookup}
                    onChange={(e) => setLookup(e.target.value as LookupType)}
                    className="bg-surface-container-low border-outline-variant font-data-mono text-on-surface focus:border-primary h-8 border px-2 text-[12px] outline-none"
                  >
                    {LOOKUP_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <form className="flex flex-1 items-end gap-2" onSubmit={executeSearch}>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-on-surface-variant font-label-caps text-[10px] uppercase">
                      {lookup === 'email'
                        ? 'Email / Exact Match'
                        : lookup === 'domain'
                          ? 'Domain Pattern (*@domain.com)'
                          : 'User ID (UUID)'}
                    </span>
                    <input
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={
                        lookup === 'email'
                          ? 'admin@example.com'
                          : lookup === 'domain'
                            ? 'shop.myshopify.com'
                            : 'acc_… 或 uuid'
                      }
                      className="bg-surface-container-low border-outline-variant font-data-mono text-on-surface focus:border-primary h-8 w-full border px-3 py-1 text-[12px] outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !q.trim()}
                    className="bg-primary text-on-primary border-primary hover:bg-surface-container-high hover:text-primary font-label-caps flex h-8 items-center gap-2 border px-4 text-[10px] uppercase transition-colors disabled:opacity-50"
                  >
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    执行检索
                  </button>
                </form>
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

            <div className="bg-primary-container border-outline-variant overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead className="border-outline-variant bg-surface-container-low border-b">
                  <tr>
                    <th className={TH}>账号 / 邮箱</th>
                    <th className={TH}>角色</th>
                    <th className={`${TH} text-right`}>详情</th>
                  </tr>
                </thead>
                <tbody className="font-data-mono text-on-surface text-[13px]">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-outline-variant border-b transition-colors ${
                        selectedId === row.id
                          ? 'bg-surface-container-high'
                          : 'hover:bg-surface-container-high'
                      }`}
                    >
                      <td className={`${TD} text-primary`}>
                        <button
                          type="button"
                          onClick={() => void openDetail(row.id)}
                          className="text-primary hover:underline"
                        >
                          {row.email}
                        </button>
                      </td>
                      <td className={TD}>{row.role || '—'}</td>
                      <td className={`${TD} text-right`}>
                        <Link
                          href={`/accounts/${row.id}`}
                          className="text-on-surface-variant hover:text-primary inline-flex items-center gap-1"
                        >
                          打开
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && searched && !error ? (
                    <tr>
                      <td colSpan={3} className={`${TD} text-on-surface-variant text-center`}>
                        无匹配账号
                      </td>
                    </tr>
                  ) : null}
                  {!searched && !error ? (
                    <tr>
                      <td colSpan={3} className={`${TD} text-on-surface-variant text-center`}>
                        输入前缀或域名后执行检索
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* 右：Membership Panopticon */}
          <div className="col-span-12 xl:col-span-4">
            <div className="bg-primary-container border-outline-variant rounded-lg border p-4">
              <h2 className="text-on-surface mb-3 flex items-center gap-2 border-b border-outline-variant pb-2 text-sm font-bold">
                <User className="text-secondary h-4 w-4" aria-hidden="true" />
                Membership Panopticon
              </h2>
              {!detail ? (
                <p className="text-on-surface-variant font-data-mono m-0 text-[12px]">
                  {selectedId ? '加载中…' : '点击左侧账号查看跨店身份与计费归属。'}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-on-surface font-data-mono text-[13px]">{detail.email}</div>
                    <div className="text-on-surface-variant font-data-mono text-[11px]">
                      ID: {detail.id}
                    </div>
                    <div className="text-on-surface-variant font-data-mono text-[11px]">
                      角色: {detail.role || '—'} · 店铺: {detail.totalShops ?? detail.shops.length}
                    </div>
                    {detail.totalMonthlyBillUsd ? (
                      <div className="text-on-surface-variant font-data-mono text-[11px]">
                        Total MRR: ${detail.totalMonthlyBillUsd.toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {detail.shops.map((s) => (
                      <div
                        key={s.shopDomain}
                        className="bg-surface-container-low border-outline-variant rounded border p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Store className="text-on-surface-variant h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <Link
                            href={`/shops/${encodeURIComponent(s.shopDomain)}`}
                            className="text-primary font-data-mono truncate text-[12px]"
                          >
                            {s.shopDomain}
                          </Link>
                        </div>
                        <div className="text-on-surface-variant font-data-mono mt-1 text-[10px]">
                          {s.role} · {(s.status ?? '—').toUpperCase()} ·{' '}
                          {s.isBillingShop ? '计费店' : '非计费店'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </OpsShell>
    </AuthGate>
  );
}

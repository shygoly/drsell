'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { opsFetch } from '@/lib/api';

/**
 * /accounts —— 对齐 Stitch 项目 11226504772808429506 屏 02（Accounts & Membership Overview）。
 * 只做真实数据：邮箱前缀、店铺域名、账号 ID 三路查询；无 last-seen / IP / 2FA 数据，不造假。
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

  return (
    <AuthGate>
      <OpsShell
        active="accounts"
        title="账号检索与目录"
        subtitle="跨店角色、计费归属与账号反查（Stitch 02）"
      >
        {/* Global Lookup 卡片 */}
        <div className="bg-primary-container border-outline-variant mb-4 rounded-lg border p-4">
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
          <p className="text-on-surface-variant font-data-mono mb-2 text-[12px]">
            命中店铺：{shopDomain}
          </p>
        ) : null}

        {/* 结果表 */}
        <div className="bg-primary-container border-outline-variant overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] border-collapse text-left">
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
                  className="border-outline-variant hover:bg-surface-container-high border-b transition-colors"
                >
                  <td className={`${TD} text-primary`}>{row.email}</td>
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
      </OpsShell>
    </AuthGate>
  );
}

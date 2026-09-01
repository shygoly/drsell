'use client';

import { useEffect, useState } from 'react';
import { Bell, ListFilter, Search, Settings } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { formatAuditAction, getToken, opsFetch, type AuditLogPage } from '@/lib/api';

const ACTION_OPTIONS = [
  { value: '', label: '全部动作' },
  { value: 'shop.dunning', label: '发催缴提醒' },
  { value: 'shop.extend_freeze', label: '延长解冻期' },
  { value: 'shop.billing_shop', label: '改指定计费店' },
  { value: 'shop.resync', label: '重跑同步' },
  { value: 'shop.impersonate', label: '代登录' },
  { value: 'shop.disable_widget', label: '停用聊天窗' },
];

const RANGE_OPTIONS = [
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'all', label: '全部时间' },
];

const PAGE_SIZE = 50;

const SELECT =
  'bg-surface border-ink text-label-caps font-label-caps text-ink h-8 appearance-none border pl-2 pr-8 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink';
const TH = 'ops-cell font-label-caps text-label-caps text-ink';

export default function AuditPage() {
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [range, setRange] = useState('7d');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) window.location.href = '/login';
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (action) params.set('action', action);
    if (range === '7d') params.set('from', new Date(Date.now() - 7 * 86_400_000).toISOString());
    else if (range === '30d')
      params.set('from', new Date(Date.now() - 30 * 86_400_000).toISOString());
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    opsFetch<AuditLogPage>(`/ops/audit-logs?${params}`)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [q, action, range, offset]);

  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.items ?? [];

  return (
    <AuthGate>
      <OpsShell active="audit" padded={false} chrome={false}>
        {/* 稿子的 h-16 里同时装标题与检索，不是两层 */}
        <header className="border-ink bg-card-surface flex h-16 items-center justify-between gap-4 border-b px-[16px]">
          <h1 className="font-headline-md text-headline-md text-ink m-0">审计日志</h1>
          <div className="flex items-center gap-3">
            <label className="relative flex items-center">
              <Search
                className="text-on-surface-variant pointer-events-none absolute left-2.5 h-4 w-4"
                aria-hidden="true"
              />
              <span className="sr-only">全局检索</span>
              <input
                type="search"
                placeholder="搜索店铺、账号或操作记录"
                className="bg-surface border-ink font-data-mono text-data-mono focus:ring-ink h-8 w-64 border py-1 pl-8 pr-3 focus:outline-none focus:ring-1"
              />
            </label>
            <button
              type="button"
              aria-label="通知"
              className="text-on-surface-variant hover:text-ink flex h-8 w-8 items-center justify-center transition-colors"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="设置"
              className="text-on-surface-variant hover:text-ink flex h-8 w-8 items-center justify-center transition-colors"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-[16px] overflow-auto p-[16px]">
          {error ? <p className="text-error m-0 text-sm">{error}</p> : null}

          {/* 筛选条 —— 稿子把它包在 bg-card-surface border border-ink p-tight 的容器里 */}
          <div className="bg-card-surface border-ink flex flex-wrap items-center justify-between gap-2 border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="text-on-surface-variant pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="搜索操作者或店铺"
                  className="bg-surface border-ink font-data-mono text-data-mono text-ink focus:border-ink focus:ring-ink h-8 w-48 border pl-8 pr-2 focus:outline-none focus:ring-1"
                />
              </div>
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setOffset(0);
                }}
                aria-label="动作"
                className={SELECT}
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={range}
                onChange={(e) => {
                  setRange(e.target.value);
                  setOffset(0);
                }}
                aria-label="时间范围"
                className={SELECT}
              >
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="bg-surface-container-high border-ink text-ink font-label-caps text-label-caps hover:bg-surface-variant flex h-8 items-center gap-1 border px-[16px] transition-colors"
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              筛选
            </button>
          </div>

          {/* 表格 */}
          <div className="bg-card-surface border-ink overflow-x-auto border">
            <table className="w-full min-w-[800px] border-collapse text-left">
              <thead>
                <tr className="bg-surface-container-highest border-ink border-b-2">
                  <th className={`${TH} w-40`}>时间 (Time)</th>
                  <th className={TH}>操作者 (Operator)</th>
                  <th className={TH}>动作 (Action)</th>
                  <th className={TH}>对象店铺 (Target Shop)</th>
                  <th className={`${TH} w-24 text-center`}>结果 (Result)</th>
                  <th className={`${TH} w-32`}>IP</th>
                </tr>
              </thead>
              <tbody className="font-data-mono text-data-mono text-on-surface">
                {rows.map((row) => {
                  const failed = row.result !== 'ok';
                  return (
                    // 失败行整行浅色底；成功行完全不给颜色
                    <tr
                      key={row.id}
                      className={
                        failed
                          ? 'bg-error-container transition-colors'
                          : 'hover:bg-surface-container transition-colors'
                      }
                    >
                      <td className="ops-cell text-outline-variant">
                        {row.createdAt.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="ops-cell">{row.actorEmail}</td>
                      <td className="ops-cell">{formatAuditAction(row.action)}</td>
                      <td className="ops-cell">{row.shopDomain ?? '—'}</td>
                      <td className="ops-cell text-center">
                        <span
                          className={
                            failed
                              ? 'border-error bg-surface text-error inline-block border px-1 text-[10px] font-bold'
                              : 'border-ink bg-surface text-ink inline-block border px-1 text-[10px]'
                          }
                        >
                          {failed ? '失败' : '成功'}
                        </span>
                      </td>
                      <td className="ops-cell text-outline-variant">{row.ip ?? '—'}</td>
                    </tr>
                  );
                })}
                {!rows.length && !error ? (
                  <tr>
                    <td colSpan={6} className="ops-cell text-on-surface-variant text-center">
                      暂无记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* 分页 —— 稿子用 mt-auto 钉在内容区底部 */}
          <div className="border-ink bg-card-surface text-on-surface-variant mt-auto flex flex-col items-center justify-between gap-2 border p-2 text-[13px] sm:flex-row">
            <span className="font-data-mono text-data-mono">共 {total.toLocaleString()} 条</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
                className="border-ink bg-surface text-ink font-label-caps text-label-caps hover:bg-surface-container h-8 border px-3 transition-colors disabled:opacity-40"
              >
                上一页
              </button>
              <span className="font-data-mono text-data-mono px-2">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="border-ink bg-surface text-ink font-label-caps text-label-caps hover:bg-surface-container h-8 border px-3 transition-colors disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </OpsShell>
    </AuthGate>
  );
}

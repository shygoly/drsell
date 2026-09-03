'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layers, Lock } from 'lucide-react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { opsFetch, type OpsPlan } from '@/lib/api';

const CARD = 'bg-primary-container border-outline-variant flex flex-col rounded-lg border';
const CARD_TITLE =
  'text-on-surface border-outline-variant flex items-center justify-between gap-2 border-b px-4 py-3 text-sm font-bold';
const TH =
  'text-on-surface-variant font-label-caps border-outline-variant border-b px-4 py-2.5 text-left text-[10px] font-medium uppercase';
const TD = 'border-outline-variant font-data-mono text-on-surface border-b px-4 py-3 text-[12px]';

export default function PlansPage() {
  const [plans, setPlans] = useState<OpsPlan[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    opsFetch<OpsPlan[]>('/ops/plans')
      .then(setPlans)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const summary = useMemo(() => {
    if (!plans.length) return null;
    const prices = plans.map((p) => p.priceUsd);
    return {
      count: plans.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      maxTrial: Math.max(...plans.map((p) => p.trialDays)),
    };
  }, [plans]);

  return (
    <AuthGate>
      <OpsShell active="plans" padded={false} chrome="both">
        <main className="bg-sheet flex min-h-full flex-1 flex-col gap-6 p-[24px]">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-on-surface font-headline-md text-headline-md m-0 font-bold">
                全局配置
              </h1>
              <p className="text-on-surface-variant m-0 mt-1 text-[13.5px]">
                套餐价格、额度与试用天数。改动只对新订阅生效，存量按签约快照走。
              </p>
            </div>
            <span className="bg-surface-container-low border-outline-variant text-on-surface-variant font-label-caps inline-flex items-center gap-2 rounded border px-3 py-1.5 text-[10px] uppercase">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              只读目录 · 变更走 env
            </span>
          </header>

          {error ? <p className="text-error m-0 text-sm">{error}</p> : null}

          {summary ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['套餐数', String(summary.count)],
                ['月费区间', `$${summary.minPrice}–$${summary.maxPrice}`],
                ['最长试用', `${summary.maxTrial} 天`],
                ['数据源', 'BILLING_PLAN_* / OPS_PLAN_*'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="bg-surface-container-low border-outline-variant rounded border px-4 py-3"
                >
                  <p className="text-on-surface-variant font-label-caps m-0 text-[10px] uppercase">
                    {label}
                  </p>
                  <p className="text-on-surface font-data-mono m-0 mt-1 text-lg tabular-nums">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <section className={CARD}>
            <h2 className={CARD_TITLE}>
              <span className="flex items-center gap-2">
                <Layers className="text-secondary h-4 w-4" aria-hidden="true" />
                套餐对比
              </span>
              <span className="text-on-surface-variant font-data-mono text-[10px] font-normal">
                {plans.length} 个方案
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="bg-surface-container-low">
                  <tr>
                    {['套餐', 'Code', '月费', '试用', '对话/周期', 'AI 解决/周期', '坐席', 'AI 超额'].map(
                      (h) => (
                        <th key={h} className={TH}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.code} className="hover:bg-surface-container-low/60 transition-colors">
                      <td className={`${TD} font-semibold`}>{plan.displayName}</td>
                      <td className={TD}>{plan.code}</td>
                      <td className={TD}>${plan.priceUsd}</td>
                      <td className={TD}>{plan.trialDays} 天</td>
                      <td className={TD}>{plan.chatLimit.toLocaleString()}</td>
                      <td className={TD}>{plan.aiResolvedLimit.toLocaleString()}</td>
                      <td className={TD}>{plan.seatLimit}</td>
                      <td className={TD}>
                        {plan.aiOverageUsd > 0 ? `$${plan.aiOverageUsd}/次` : '—'}
                      </td>
                    </tr>
                  ))}
                  {!plans.length && !error ? (
                    <tr>
                      <td colSpan={8} className="text-on-surface-variant px-4 py-8 text-center text-[13px]">
                        暂无套餐定义
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {plans.length ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => (
                <article
                  key={plan.code}
                  className="bg-surface-container-low border-outline-variant flex flex-col rounded-lg border p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-on-surface font-data-mono m-0 text-[15px] font-bold">
                        {plan.displayName}
                      </h3>
                      <p className="text-on-surface-variant font-data-mono m-0 text-[11px]">
                        {plan.code}
                      </p>
                    </div>
                    <span className="text-primary font-data-mono text-xl font-bold tabular-nums">
                      ${plan.priceUsd}
                      <span className="text-on-surface-variant text-[11px] font-normal">/mo</span>
                    </span>
                  </div>
                  <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                    {[
                      ['试用', `${plan.trialDays} 天`],
                      ['对话额度', plan.chatLimit.toLocaleString()],
                      ['AI 解决', plan.aiResolvedLimit.toLocaleString()],
                      ['坐席', `${plan.seatLimit} 席`],
                      ['AI 超额', plan.aiOverageUsd > 0 ? `$${plan.aiOverageUsd}/次` : '不计费'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2 border-b border-outline-variant/50 py-1">
                        <dt className="text-on-surface-variant m-0">{k}</dt>
                        <dd className="text-on-surface font-data-mono m-0 tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          ) : null}

          <p className="text-on-surface-variant font-data-mono m-0 text-[11px]">
            运营台店铺详情中的用量上限与超额提示，均按上表解析当前店铺的 planCode。
          </p>
        </main>
      </OpsShell>
    </AuthGate>
  );
}

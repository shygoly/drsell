'use client';

import { useEffect, useState } from 'react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { opsFetch, type OpsPlan } from '@/lib/api';

export default function PlansPage() {
  const [plans, setPlans] = useState<OpsPlan[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    opsFetch<OpsPlan[]>('/ops/plans')
      .then(setPlans)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  return (
    <AuthGate>
      <OpsShell active="plans" title="套餐配置" subtitle="价格、额度、试用天数（只读目录，变更走 env / 后续 CRUD）">
        {error ? <p className="text-sm text-lost">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <Card key={plan.code}>
              <CardHeader>
                <CardTitle>
                  {plan.displayName}{' '}
                  <span className="font-data text-base font-normal text-muted-foreground">
                    ({plan.code})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-[13.5px]">
                <p className="m-0">
                  <strong className="font-data">${plan.priceUsd}</strong>/月 · 试用 {plan.trialDays} 天
                </p>
                <ul className="m-0 list-inside list-disc text-muted-foreground">
                  <li>对话 {plan.chatLimit.toLocaleString()} / 周期</li>
                  <li>AI 解决 {plan.aiResolvedLimit.toLocaleString()} / 周期</li>
                  <li>坐席 {plan.seatLimit} 席</li>
                  <li>AI 超出 ${plan.aiOverageUsd}/次</li>
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
        {!plans.length && !error ? (
          <p className="text-muted-foreground">暂无套餐定义</p>
        ) : null}
      </OpsShell>
    </AuthGate>
  );
}

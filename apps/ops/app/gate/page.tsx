'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import { opsFetch } from '@/lib/api';

/**
 * 订阅闸门观测台（openspec subscription-gating-and-expiry 的 3.2）。
 *
 * 存在的理由：开闸（3.3）会真的停掉商家的服务，不可逆。决策前必须能逐店核对
 * 「谁会被拦、为什么、镜像可不可信」。此前这些信息只有一行 pm2 日志，会滚掉。
 */
type GateRow = {
  shopDomain: string;
  serviceable: boolean;
  reason: string;
  graceEndsAt: string | null;
  status: string | null;
  planCode: string | null;
  isTest: boolean;
  trialEnds: string | null;
  currentPeriodEnd: string | null;
  mirrorUpdatedAt: string | null;
  lastSyncedAt: string | null;
};

type GateView = {
  enforcing: boolean;
  evaluatedAt: string;
  blockedCount: number;
  neverSyncedCount: number;
  shops: GateRow[];
};

const REASON_LABEL: Record<string, string> = {
  active: '订阅有效',
  test: '测试订阅（开发店 / 审核）',
  trial: '试用期内',
  grace: '宽限窗口内',
  'no-subscription': '没有订阅记录',
  'status-not-serviceable': '状态不可服务',
  'period-ended': '计费周期已过',
};

const fmt = (iso: string | null) => (iso ? iso.replace('T', ' ').slice(0, 16) : '—');

type SecretView = {
  previousSecretConfigured: boolean;
  safeToDelete: boolean;
  reason: string;
  observedForDays: number | null;
  quietDays: number;
  lastPreviousAt: string | null;
  quietForDays: number | null;
  stillOnPreviousTopics: string[];
  observations: Array<{
    generation: string;
    topic: string;
    count: number;
    lastSeenAt: string;
  }>;
};

export default function GatePage() {
  const [view, setView] = useState<GateView | null>(null);
  const [secret, setSecret] = useState<SecretView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opsFetch<GateView>('/ops/subscription-gate')
      .then(setView)
      .catch((e: unknown) => setError(String(e)));
    opsFetch<SecretView>('/ops/webhook-secret')
      .then(setSecret)
      .catch(() => undefined);
  }, []);

  if (error) {
    return (
      <AuthGate>
        <OpsShell active="gate" title="订阅闸门" subtitle="观测期清单">
          <p className="text-[13.5px] text-muted-foreground">读取失败：{error}</p>
        </OpsShell>
      </AuthGate>
    );
  }

  const blocked = view?.shops.filter((s) => !s.serviceable) ?? [];
  const passing = view?.shops.filter((s) => s.serviceable) ?? [];

  return (
    <AuthGate>
      <OpsShell
        active="gate"
        title="订阅闸门"
        subtitle={
          view
            ? view.enforcing
              ? '闸门已开启 —— 下表中不可服务的店铺此刻正被拦截'
              : '观测模式 —— 只记录不拦截，下表是「若开闸会拦谁」'
            : '载入中…'
        }
        meta={view ? `判定于 ${fmt(view.evaluatedAt)}` : undefined}
      >
        {view ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant={view.enforcing ? 'frozen' : 'ok'}>
              {view.enforcing ? 'ENFORCING' : 'OBSERVE ONLY'}
            </Badge>
            <Badge variant={view.blockedCount ? 'lost' : 'ok'}>
              会被拦 {view.blockedCount} / {view.shops.length}
            </Badge>
            {view.neverSyncedCount ? (
              <Badge variant="frozen">{view.neverSyncedCount} 个店的镜像从未同步过</Badge>
            ) : null}
          </div>
        ) : null}

        {view && view.neverSyncedCount > 0 ? (
          <p className="mb-4 text-[13.5px] text-muted-foreground">
            从未同步过的店，其 <span className="font-data">currentPeriodEnd</span>{' '}
            不代表 Shopify 的事实——据此停服就是误停。开闸前先让它们跑过一次{' '}
            <span className="font-data">app_subscriptions/update</span>。
          </p>
        ) : null}

        <Card className="mb-6">
          <CardContent className="overflow-x-auto">
            <h2 className="mb-3 text-[13.5px] font-semibold">
              不可服务（{blocked.length}）
            </h2>
            <GateTable rows={blocked} empty="没有店铺会被拦下" />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="overflow-x-auto">
            <h2 className="mb-3 text-[13.5px] font-semibold">可服务（{passing.length}）</h2>
            <GateTable rows={passing} empty="无" />
          </CardContent>
        </Card>

        {secret?.previousSecretConfigured ? <SecretCard v={secret} /> : null}
      </OpsShell>
    </AuthGate>
  );
}

const TH =
  'font-data px-3.5 py-2.5 text-left text-[9.5px] font-semibold tracking-[0.12em] uppercase text-muted-foreground';

function GateTable({ rows, empty }: { rows: GateRow[]; empty: string }) {
  return (
    <table className="w-full border-collapse text-[13.5px]">
      <thead>
        <tr className="border-b border-border">
          <th className={TH}>域名</th>
          <th className={TH}>判定</th>
          <th className={TH}>状态</th>
          <th className={TH}>档位</th>
          <th className={TH}>周期终点</th>
          <th className={TH}>宽限至</th>
          <th className={TH}>最后同步</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.shopDomain} className="border-b border-border last:border-0">
            <td className="px-3.5 py-2.5">
              <Link href={`/shops/${encodeURIComponent(s.shopDomain)}`} className="font-data">
                {s.shopDomain}
              </Link>
            </td>
            <td className="px-3.5 py-2.5">
              <Badge variant={s.serviceable ? 'ok' : 'lost'}>
                {REASON_LABEL[s.reason] ?? s.reason}
              </Badge>
            </td>
            <td className="font-data px-3.5 py-2.5">
              {s.status ?? '—'}
              {s.isTest ? <span className="ml-1.5 text-muted-foreground">[test]</span> : null}
            </td>
            <td className="font-data px-3.5 py-2.5">{s.planCode ?? '—'}</td>
            <td className="font-data px-3.5 py-2.5">{fmt(s.currentPeriodEnd)}</td>
            <td className="font-data px-3.5 py-2.5">{fmt(s.graceEndsAt)}</td>
            <td className="font-data px-3.5 py-2.5">
              {s.lastSyncedAt ? (
                fmt(s.lastSyncedAt)
              ) : (
                <span className="text-lost">从未</span>
              )}
            </td>
          </tr>
        ))}
        {!rows.length ? (
          <tr>
            <td colSpan={7} className="px-3.5 py-2.5 text-muted-foreground">
              {empty}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/**
 * 旧 webhook 密钥的删除判据（openspec tasks 0.1）。
 *
 * 放在闸门这一页，因为两者是同一条因果链：`app_subscriptions/update` 是付款解冻的
 * 唯一渠道，删早了旧密钥它就全挂——闸门会把已付款的商家一直拦着。
 */
function SecretCard({ v }: { v: SecretView }) {
  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <h2 className="mb-3 text-[13.5px] font-semibold">
          webhook 密钥轮换 · SHOPIFY_API_SECRET_PREVIOUS
        </h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant={v.safeToDelete ? 'ok' : 'frozen'}>
            {v.safeToDelete ? '可以删除' : '尚不能删除'}
          </Badge>
          {v.quietForDays !== null ? (
            <Badge variant="outline">
              旧密钥已静默 {v.quietForDays} 天 / 需 {v.quietDays} 天
            </Badge>
          ) : (
            <Badge variant="outline">旧密钥尚无观测</Badge>
          )}
          <Badge variant="outline">
            已观测 {v.observedForDays ?? 0} 天 / 需 {v.quietDays} 天
          </Badge>
        </div>
        {/* 结论必须带理由：光看「尚不能删除」没人知道还缺什么、要等什么 */}
        <p className="mb-3 text-[13.5px] text-muted-foreground">{v.reason}</p>
        {v.stillOnPreviousTopics.length ? (
          <p className="mb-3 text-[13.5px] text-muted-foreground">
            以下 topic 只在旧密钥下出现过，现在删会让它们全部 401：
            <span className="font-data ml-1">{v.stillOnPreviousTopics.join(', ')}</span>
          </p>
        ) : null}
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-border">
              <th className={TH}>密钥代</th>
              <th className={TH}>topic</th>
              <th className={TH}>次数</th>
              <th className={TH}>最近一次</th>
            </tr>
          </thead>
          <tbody>
            {v.observations.map((o) => (
              <tr key={`${o.generation}:${o.topic}`} className="border-b border-border last:border-0">
                <td className="px-3.5 py-2.5">
                  <Badge variant={o.generation === 'previous' ? 'frozen' : 'ok'}>
                    {o.generation}
                  </Badge>
                </td>
                <td className="font-data px-3.5 py-2.5">{o.topic}</td>
                <td className="font-data px-3.5 py-2.5">{o.count}</td>
                <td className="font-data px-3.5 py-2.5">{fmt(o.lastSeenAt)}</td>
              </tr>
            ))}
            {!v.observations.length ? (
              <tr>
                <td colSpan={4} className="px-3.5 py-2.5 text-muted-foreground">
                  还没观测到任何 webhook —— 没有观测就不能下结论
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

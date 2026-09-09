'use client';

import { useEffect, useState } from 'react';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import { opsFetch } from '@/lib/api';

/**
 * 部署与配置实况（openspec ops-deploy-observability）。
 *
 * 存在的理由是两次真实事故：`SHOPIFY_API_SECRET` 与 `_PREVIOUS` 配反了一周
 * 没人发现；给服务器上 `apps/web/.env` 加变量重启后进程始终读不到——因为它读的是
 * standalone 里的另一份。两次都不是没有线索，而是**没有任何地方把两份配置的
 * 指纹并排摆出来**。这一页就是为那一眼而存在。
 *
 * 页面上只有指纹与状态，没有任何密钥或令牌的值——一次截图或会话泄露不应等同于泄密。
 */
type Fingerprint = { fp: string | null; len: number } | null;

type EnvRow = {
  key: string;
  root: Fingerprint;
  runtime: Fingerprint;
  consistent: boolean;
  note: string | null;
};

type DeployView = {
  known: boolean;
  reason: string | null;
  commit: string | null;
  commitSubject: string | null;
  dirty: boolean;
  builtAt: string | null;
  manifestPath: string;
  inconsistentTotal: number;
  apps: Array<{
    name: string;
    runtimeIsStandalone: boolean;
    plain: Record<string, string>;
    env: EnvRow[];
    inconsistentCount: number;
  }>;
  api: { startedAt: string; uptimeSeconds: number; stale: boolean; note: string | null };
  migration: { headInCode: string | null; headApplied: string | null; consistent: boolean };
  tokens: Array<{
    shopDomain: string;
    installed: boolean;
    expiresAt: string | null;
    expiresInHours: number | null;
    expired: boolean;
    expiringSoon: boolean;
    hasRefreshToken: boolean;
    atRisk: boolean;
  }>;
  evaluatedAt: string;
};

const fmt = (iso: string | null) => (iso ? iso.replace('T', ' ').slice(0, 16) : '—');
const showFp = (f: Fingerprint) => (f ? `${f.fp ?? '(空)'} · ${f.len}` : '缺席');

function uptime(seconds: number) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时`;
  return `${Math.floor(seconds / 86400)} 天`;
}

export default function DeployPage() {
  const [view, setView] = useState<DeployView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opsFetch<DeployView>('/ops/deploy')
      .then(setView)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <AuthGate>
        <OpsShell active="deploy" title="部署与配置" subtitle="运行时实况">
          <p className="text-[13.5px] text-muted-foreground">读取失败：{error}</p>
        </OpsShell>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <OpsShell
        active="deploy"
        title="部署与配置"
        subtitle={
          view
            ? view.known
              ? '生产正在运行的版本与配置指纹'
              : '部署清单不可用'
            : '载入中…'
        }
        meta={view ? `读取于 ${fmt(view.evaluatedAt)}` : undefined}
      >
        {view && !view.known ? (
          <Card className="mb-6">
            <CardContent>
              <p className="text-[13.5px]">{view.reason}</p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                清单路径 <span className="font-data">{view.manifestPath}</span>
                。它由 <span className="font-data">scripts/deploy-mvp.sh</span> 在部署时生成；
                缺失通常意味着这次不是走部署脚本上去的。
                <strong className="ml-1">这不等于「一切正常」，只是「不知道」。</strong>
              </p>
            </CardContent>
          </Card>
        ) : null}

        {view?.known ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant={view.dirty ? 'frozen' : 'ok'}>
                {view.commit ?? '未知版本'}
              </Badge>
              <Badge variant={view.inconsistentTotal ? 'lost' : 'ok'}>
                配置分岔 {view.inconsistentTotal}
              </Badge>
              <Badge variant={view.migration.consistent ? 'ok' : 'lost'}>
                迁移{view.migration.consistent ? '一致' : '不一致'}
              </Badge>
              {view.api.stale ? <Badge variant="lost">API 未随本次部署重启</Badge> : null}
            </div>

            <Card className="mb-6">
              <CardContent>
                <h2 className="mb-3 text-[13.5px] font-semibold">版本</h2>
                <dl className="grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
                  <Row label="commit" value={view.commit ?? '—'} data />
                  <Row label="构建于" value={fmt(view.builtAt)} />
                  <Row label="提交标题" value={view.commitSubject ?? '—'} />
                  <Row
                    label="API 进程"
                    value={`${fmt(view.api.startedAt)} 起（${uptime(view.api.uptimeSeconds)}）`}
                  />
                </dl>
                {view.dirty ? (
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    构建时工作区有未提交改动，
                    <strong>这个 commit 不代表线上真正跑的代码</strong>。
                  </p>
                ) : null}
                {view.api.note ? (
                  <p className="mt-3 text-[13px] text-muted-foreground">{view.api.note}</p>
                ) : null}
                <p className="mt-3 text-[13px] text-muted-foreground">
                  这里只能精确报出 API 自己的启动时刻。另外三个是独立的 Next 进程，
                  本服务不去 exec pm2 问它们——为一个只读视图给 API 开进程执行能力不划算；
                  它们是否活着由部署脚本的公网断言覆盖。
                </p>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardContent>
                <h2 className="mb-1 text-[13.5px] font-semibold">迁移</h2>
                <dl className="grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
                  <Row label="代码里最新" value={view.migration.headInCode ?? '—'} data />
                  <Row label="数据库已应用" value={view.migration.headApplied ?? '—'} data />
                </dl>
                {!view.migration.consistent ? (
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    两者不一致：代码期待的表结构与数据库实际的不同，
                    可能是 <span className="font-data">migrate deploy</span> 失败或被跳过。
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {view.apps.map((app) => (
              <Card key={app.name} className="mb-6">
                <CardContent className="overflow-x-auto">
                  <h2 className="mb-1 text-[13.5px] font-semibold">
                    {app.name}
                    {app.inconsistentCount ? (
                      <span className="ml-2 text-[13px] font-normal text-destructive">
                        {app.inconsistentCount} 项分岔
                      </span>
                    ) : null}
                  </h2>
                  <p className="mb-3 text-[13px] text-muted-foreground">
                    {app.runtimeIsStandalone
                      ? '两份配置：进程读的是 standalone 那份。改根 .env 不重新部署 = 不生效。'
                      : '只有一份配置，改完重启即生效。'}
                  </p>
                  <table className="w-full text-left text-[13px]">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-4 font-medium">变量</th>
                        <th className="py-1 pr-4 font-medium">根 .env</th>
                        <th className="py-1 pr-4 font-medium">
                          {app.runtimeIsStandalone ? 'standalone（进程读这份）' : '进程读这份'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {app.env.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-2 text-muted-foreground">
                            清单里没有该应用的配置项
                          </td>
                        </tr>
                      ) : (
                        app.env.map((row) => (
                          <tr
                            key={row.key}
                            className={row.consistent ? '' : 'bg-destructive/10'}
                          >
                            <td className="py-1 pr-4 font-data">{row.key}</td>
                            <td className="py-1 pr-4 font-data">{showFp(row.root)}</td>
                            <td className="py-1 pr-4 font-data">
                              {showFp(row.runtime)}
                              {row.note ? (
                                <span className="ml-2 font-sans text-muted-foreground">
                                  {row.note}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {Object.keys(app.plain).length ? (
                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                      {Object.entries(app.plain).map(([k, v]) => (
                        <Row key={k} label={k} value={v} data />
                      ))}
                    </dl>
                  ) : null}
                </CardContent>
              </Card>
            ))}

            <Card className="mb-6">
              <CardContent className="overflow-x-auto">
                <h2 className="mb-3 text-[13.5px] font-semibold">
                  Shopify 令牌（{view.tokens.length}）
                </h2>
                <table className="w-full text-left text-[13px]">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-4 font-medium">店铺</th>
                      <th className="py-1 pr-4 font-medium">访问令牌到期</th>
                      <th className="py-1 pr-4 font-medium">刷新令牌</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.tokens.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-2 text-muted-foreground">
                          没有已安装的店铺
                        </td>
                      </tr>
                    ) : (
                      view.tokens.map((t) => (
                        <tr
                          key={t.shopDomain}
                          className={t.expired || t.atRisk ? 'bg-destructive/10' : ''}
                        >
                          <td className="py-1 pr-4 font-data">
                            {t.shopDomain}
                            {t.installed ? null : (
                              <span className="ml-2 font-sans text-muted-foreground">已卸载</span>
                            )}
                          </td>
                          <td className="py-1 pr-4">
                            {t.expiresAt ? (
                              <>
                                <span className="font-data">{fmt(t.expiresAt)}</span>
                                {t.expired ? (
                                  <span className="ml-2 text-destructive">已过期</span>
                                ) : t.expiringSoon ? (
                                  <span className="ml-2 text-destructive">
                                    {t.expiresInHours} 小时内到期
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-muted-foreground">不过期（历史令牌）</span>
                            )}
                          </td>
                          <td className="py-1 pr-4">
                            {t.hasRefreshToken ? (
                              '有'
                            ) : t.atRisk ? (
                              <span className="text-destructive">
                                无 —— 到期即失去 Admin API 访问，商家须重装
                              </span>
                            ) : (
                              '无'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <p className="text-[13px] text-muted-foreground">
              本页只显示指纹（sha256 前 12 位）与长度，不显示任何密钥或令牌的值。
              配置「应该是什么」见仓库的 <span className="font-data">DEPLOY.md</span>；
              这一页记的是「现在是什么」。
            </p>
          </>
        ) : null}
      </OpsShell>
    </AuthGate>
  );
}

function Row({ label, value, data }: { label: string; value: string; data?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="min-w-[7.5rem] text-muted-foreground">{label}</dt>
      <dd className={data ? 'font-data break-all' : 'break-all'}>{value}</dd>
    </div>
  );
}

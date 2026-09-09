/**
 * 部署清单的解读——纯函数，不碰数据库也不读文件，好测。
 *
 * 清单由 `scripts/deploy-manifest.mjs` 在部署时于服务器上生成（openspec design D1/D3）。
 * 这里只负责把它变成运营台能一眼看懂的东西，核心是**两份 .env 的并排比对**：
 * 三个 Next 应用各有两份配置，进程读的是 standalone 那份，而两份分岔过且
 * 没有任何视图能看出来（2026-09-09，改了根 .env 重启，进程始终读不到）。
 */

export type EnvFingerprint = { fp: string | null; len: number };

export type EnvSummary = {
  present: boolean;
  file: string;
  secrets: Record<string, EnvFingerprint>;
  plain: Record<string, string>;
};

export type AppEnv = {
  root: EnvSummary;
  runtime: EnvSummary;
  /** 进程读的是不是 standalone 那份。api 为 false（只有一份配置）。 */
  runtimeIsStandalone: boolean;
};

export type DeployManifest = {
  schema: number;
  commit: string | null;
  commitSubject: string | null;
  builtAt: string;
  migrationHeadInCode: string | null;
  apps: Record<string, AppEnv>;
};

export type EnvRow = {
  key: string;
  root: EnvFingerprint | null;
  runtime: EnvFingerprint | null;
  consistent: boolean;
  /** 只在不一致时给出，说明后果。 */
  note: string | null;
};

/**
 * 看起来像密钥的值一律打码，即便它出现在「非密钥」清单里。
 *
 * 这是纵深防御：PLAIN_KEYS 是人工维护的白名单，而人工白名单会漏。
 * 一次漏配就等于把密钥挂到公网页面上。
 */
const SECRET_SHAPED =
  /(shpss_[A-Za-z0-9]{8,}|shpat_[A-Za-z0-9]{8,}|shpca_[A-Za-z0-9]{8,}|cfut_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9]{16,}|postgres(?:ql)?:\/\/[^\s]*:[^\s@]+@|:\/\/[^\s:@/]+:[^\s@/]+@|GOCSPX-[A-Za-z0-9_-]{8,}|[A-Fa-f0-9]{32,})/;

export function scrubPlain(value: string): string {
  return SECRET_SHAPED.test(value) ? '«已打码：疑似密钥»' : value;
}

export function scrubPlainMap(plain: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(plain)) out[k] = scrubPlain(v);
  return out;
}

/** 两份配置的并排比对。缺席也是一种不一致——一边有一边没有，正是踩过的那个坑。 */
export function compareAppEnv(app: AppEnv): EnvRow[] {
  const keys = new Set([
    ...Object.keys(app.root?.secrets ?? {}),
    ...Object.keys(app.runtime?.secrets ?? {}),
  ]);
  const rows: EnvRow[] = [];
  for (const key of [...keys].sort()) {
    const root = app.root?.secrets?.[key] ?? null;
    const runtime = app.runtime?.secrets?.[key] ?? null;
    const consistent = root?.fp === runtime?.fp && root?.len === runtime?.len;
    rows.push({
      key,
      root,
      runtime,
      consistent,
      note: consistent
        ? null
        : app.runtimeIsStandalone
          ? '进程读的是 standalone 那份；改根 .env 不会生效，需重新部署'
          : '两份配置不一致',
    });
  }
  return rows;
}

export type DeployStatus = {
  known: boolean;
  reason: string | null;
  commit: string | null;
  commitSubject: string | null;
  dirty: boolean;
  builtAt: string | null;
  migrationHeadInCode: string | null;
  apps: Array<{
    name: string;
    runtimeIsStandalone: boolean;
    plain: Record<string, string>;
    env: EnvRow[];
    inconsistentCount: number;
  }>;
  inconsistentTotal: number;
};

/**
 * 清单缺失时返回明确的「未知」而不是空对象——空对象会被前端渲染成一片空白，
 * 看起来像「一切正常」。缺证据和没问题是两回事。
 */
export function summarizeDeploy(manifest: DeployManifest | null): DeployStatus {
  if (!manifest || manifest.schema !== 1) {
    return {
      known: false,
      reason: manifest
        ? `清单版本 ${String(manifest.schema)} 不认识——部署脚本比本服务新`
        : '部署清单缺失：本次可能未经 deploy-mvp.sh 部署，或脚本生成失败',
      commit: null,
      commitSubject: null,
      dirty: false,
      builtAt: null,
      migrationHeadInCode: null,
      apps: [],
      inconsistentTotal: 0,
    };
  }

  const apps = Object.entries(manifest.apps ?? {}).map(([name, app]) => {
    const env = compareAppEnv(app);
    return {
      name,
      runtimeIsStandalone: app.runtimeIsStandalone,
      plain: scrubPlainMap(app.runtime?.plain ?? {}),
      env,
      inconsistentCount: env.filter((r) => !r.consistent).length,
    };
  });

  return {
    known: true,
    reason: null,
    commit: manifest.commit,
    commitSubject: manifest.commitSubject,
    // 工作区脏 = 产物与 commit 不对应，这个版本号不能全信
    dirty: Boolean(manifest.commit?.endsWith('-dirty')),
    builtAt: manifest.builtAt ?? null,
    migrationHeadInCode: manifest.migrationHeadInCode ?? null,
    apps,
    inconsistentTotal: apps.reduce((n, a) => n + a.inconsistentCount, 0),
  };
}

/** 令牌到期：24 小时内到期要显眼，没有刷新令牌意味着到期即失去 Admin API 访问。 */
export function tokenRows(
  shops: Array<{
    shopDomain: string;
    accessTokenExpiresAt: Date | null;
    hasRefreshToken: boolean;
    uninstalledAt: Date | null;
  }>,
  now: Date,
) {
  return shops.map((s) => {
    const ms = s.accessTokenExpiresAt ? s.accessTokenExpiresAt.getTime() - now.getTime() : null;
    return {
      shopDomain: s.shopDomain,
      installed: !s.uninstalledAt,
      expiresAt: s.accessTokenExpiresAt?.toISOString() ?? null,
      expiresInHours: ms == null ? null : Math.floor(ms / 3600000),
      expired: ms != null && ms <= 0,
      expiringSoon: ms != null && ms > 0 && ms <= 24 * 3600000,
      hasRefreshToken: s.hasRefreshToken,
      // 没有刷新令牌 + 会过期 = 到期那一刻该店的 Admin API 访问就没了，商家须重装
      atRisk: ms != null && !s.hasRefreshToken,
    };
  });
}

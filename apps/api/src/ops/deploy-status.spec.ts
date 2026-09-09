import {
  compareAppEnv,
  scrubPlain,
  summarizeDeploy,
  tokenRows,
  type AppEnv,
  type DeployManifest,
} from './deploy-status';

const fpOf = (fp: string, len = 38) => ({ fp, len });

const appEnv = (
  rootSecrets: Record<string, { fp: string; len: number }>,
  runtimeSecrets: Record<string, { fp: string; len: number }>,
  runtimeIsStandalone = true,
): AppEnv => ({
  root: { present: true, file: 'apps/web/.env', secrets: rootSecrets, plain: {} },
  runtime: {
    present: true,
    file: 'apps/web/standalone/apps/web/.env',
    secrets: runtimeSecrets,
    plain: {},
  },
  runtimeIsStandalone,
});

const manifest = (apps: Record<string, AppEnv>, commit = 'abc1234'): DeployManifest => ({
  schema: 1,
  commit,
  commitSubject: 'feat: something',
  builtAt: '2026-09-09T08:00:00.000Z',
  migrationHeadInCode: '20260909070000_webhook_secret_use',
  apps,
});

describe('两份配置的并排比对', () => {
  it('一致时不报异常', () => {
    const rows = compareAppEnv(
      appEnv({ SHOPIFY_API_SECRET: fpOf('aaa') }, { SHOPIFY_API_SECRET: fpOf('aaa') }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].consistent).toBe(true);
    expect(rows[0].note).toBeNull();
  });

  it('分岔时说清后果——这正是 2026-09-09 踩的坑', () => {
    // 改了根 .env、重启，进程始终读不到：它读的是 standalone 那份
    const rows = compareAppEnv(
      appEnv({ SHOPIFY_API_SECRET: fpOf('new') }, { SHOPIFY_API_SECRET: fpOf('old') }),
    );
    expect(rows[0].consistent).toBe(false);
    expect(rows[0].note).toMatch(/standalone/);
    expect(rows[0].note).toMatch(/不会生效/);
  });

  it('一边有一边没有也算不一致', () => {
    const rows = compareAppEnv(appEnv({ SHOPIFY_API_SECRET_PREVIOUS: fpOf('x') }, {}));
    expect(rows[0].consistent).toBe(false);
    expect(rows[0].runtime).toBeNull();
  });

  it('长度不同即使指纹碰巧相同也算不一致', () => {
    const rows = compareAppEnv(
      appEnv({ K: { fp: 'same', len: 38 } }, { K: { fp: 'same', len: 40 } }),
    );
    expect(rows[0].consistent).toBe(false);
  });

  it('api 只有一份配置，措辞不提 standalone', () => {
    const rows = compareAppEnv(appEnv({ K: fpOf('a') }, { K: fpOf('b') }, false));
    expect(rows[0].note).not.toMatch(/standalone/);
  });
});

describe('清单缺失', () => {
  it('返回明确的未知，而不是空对象——空白会被看成一切正常', () => {
    const s = summarizeDeploy(null);
    expect(s.known).toBe(false);
    expect(s.reason).toMatch(/缺失/);
    expect(s.commit).toBeNull();
  });

  it('清单版本不认识时也报未知，不硬解析', () => {
    const s = summarizeDeploy({ ...manifest({}), schema: 99 } as DeployManifest);
    expect(s.known).toBe(false);
    expect(s.reason).toMatch(/99/);
  });
});

describe('版本', () => {
  it('工作区脏要标出来——产物与 commit 不对应', () => {
    const s = summarizeDeploy(manifest({}, 'abc1234-dirty'));
    expect(s.dirty).toBe(true);
  });

  it('干净的 commit 不标脏', () => {
    expect(summarizeDeploy(manifest({})).dirty).toBe(false);
  });

  it('汇总所有应用的不一致条数', () => {
    const s = summarizeDeploy(
      manifest({
        web: appEnv({ A: fpOf('1'), B: fpOf('2') }, { A: fpOf('9'), B: fpOf('2') }),
        api: appEnv({ A: fpOf('1') }, { A: fpOf('1') }, false),
      }),
    );
    expect(s.inconsistentTotal).toBe(1);
    expect(s.apps.find((a) => a.name === 'web')?.inconsistentCount).toBe(1);
  });
});

describe('绝不泄露明文', () => {
  // 夹具一律用「格式合法但含非十六进制字母」的合成值。用真凭据当夹具会把它
  // 提交进仓库——2026-09-09 我这么干过一次，靠 GitHub 推送保护才拦下。
  // spec/check-no-secrets.mjs 现在会守住这条。
  it.each([
    ['shpss_notarealsecretnotarealsecretxy', 'Shopify app secret'],
    ['shpat_notarealtokennotarealtokenxyzw', 'Shopify access token'],
    ['cfut_notarealcloudflaretokenxyzwvut', 'Cloudflare token'],
    ['postgresql://user:notarealpassword@127.0.0.1:5433/db', '数据库连接串'],
    ['GOCSPX-notarealgooglesecret', 'Google client secret'],
    ['0123456789abcdef0123456789abcdef', '32 位十六进制'],
  ])('%s（%s）被打码', (secret) => {
    expect(scrubPlain(secret)).not.toContain(secret);
    expect(scrubPlain(secret)).toMatch(/已打码/);
  });

  it('正常配置值原样显示', () => {
    expect(scrubPlain('https://drsell.szchada.top')).toBe('https://drsell.szchada.top');
    expect(scrubPlain('/api')).toBe('/api');
    expect(scrubPlain('true')).toBe('true');
  });

  it('整份响应里不含任何明文密钥', () => {
    const app = appEnv({ SHOPIFY_API_SECRET: fpOf('abc') }, { SHOPIFY_API_SECRET: fpOf('abc') });
    app.runtime.plain = {
      SHOPIFY_APP_URL: 'https://drsell.szchada.top',
      // 白名单漏配的情形：密钥混进了「非密钥」清单
      LEAKED: 'shpss_notarealsecretnotarealsecretxy',
    };
    const json = JSON.stringify(summarizeDeploy(manifest({ web: app })));
    expect(json).not.toContain('shpss_notarealsecretnotarealsecretxy');
    expect(json).toContain('drsell.szchada.top');
  });
});

describe('令牌到期', () => {
  const NOW = new Date('2026-09-09T12:00:00.000Z');
  const hours = (n: number) => new Date(NOW.getTime() + n * 3600000);

  it('24 小时内到期要标记', () => {
    const [r] = tokenRows(
      [{ shopDomain: 'a', accessTokenExpiresAt: hours(5), hasRefreshToken: true, uninstalledAt: null }],
      NOW,
    );
    expect(r.expiringSoon).toBe(true);
    expect(r.expired).toBe(false);
    expect(r.expiresInHours).toBe(5);
  });

  it('已过期与临近到期要分开', () => {
    const [r] = tokenRows(
      [{ shopDomain: 'a', accessTokenExpiresAt: hours(-1), hasRefreshToken: true, uninstalledAt: null }],
      NOW,
    );
    expect(r.expired).toBe(true);
    expect(r.expiringSoon).toBe(false);
  });

  it('会过期但没有刷新令牌 = 到期即失去 Admin API 访问', () => {
    const [r] = tokenRows(
      [{ shopDomain: 'a', accessTokenExpiresAt: hours(100), hasRefreshToken: false, uninstalledAt: null }],
      NOW,
    );
    expect(r.atRisk).toBe(true);
    expect(r.expiringSoon).toBe(false);
  });

  it('永不过期的令牌不算风险', () => {
    const [r] = tokenRows(
      [{ shopDomain: 'a', accessTokenExpiresAt: null, hasRefreshToken: false, uninstalledAt: null }],
      NOW,
    );
    expect(r.atRisk).toBe(false);
    expect(r.expiresInHours).toBeNull();
  });
});

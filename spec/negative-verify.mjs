#!/usr/bin/env node
// spec/negative-verify.mjs — 负向验证：校验器必须能证明自己会红。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib.mjs';

function run(checker) {
  try {
    const out = execFileSync('node', [join(REPO_ROOT, 'spec', checker)], {
      stdio: 'pipe', encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : -1,
      out: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    };
  }
}

/** 临时写入文件，返回还原函数。 */
function tempFile(rel, content) {
  const abs = join(REPO_ROOT, rel);
  const had = existsSync(abs);
  const prev = had ? readFileSync(abs, 'utf8') : null;
  writeFileSync(abs, content);
  return () => { if (had) writeFileSync(abs, prev); else unlinkSync(abs); };
}

/** 在既有文件上做一次字符串替换，返回还原函数。 */
function patchFile(rel, from, to) {
  const abs = join(REPO_ROOT, rel);
  const prev = readFileSync(abs, 'utf8');
  if (!prev.includes(from)) throw new Error(`patchFile: ${rel} 中找不到锚点 ${JSON.stringify(from)}`);
  writeFileSync(abs, prev.replace(from, to));
  return () => writeFileSync(abs, prev);
}

const CASES = [
  {
    name: 'check-ids 抓未在册 ID',
    checker: 'check-ids.mjs',
    inject: () => tempFile('packages/shared/src/__negverify.ts', '// DS-99 未在册\nexport {};\n'),
    expect: 1,
    expectMatch: /未在册的 DS-99/,
  },
  {
    name: 'check-ids 抓空登记表（§3 B）',
    checker: 'check-ids.mjs',
    inject: () => patchFile('DECISIONS.md', '## 3. B — 边界规矩', '## 33. B — 边界规矩'),
    expect: 1,
    expectMatch: /B 登记表解析为 0 行/,
  },
  {
    name: 'check-links 抓死链',
    checker: 'check-links.mjs',
    inject: () => patchFile(
      'DECISIONS.md',
      '## 1. INV — 不变量',
      '## 1. INV — 不变量\n\n见 [不存在的文件](NO_SUCH_FILE.md)。\n',
    ),
    expect: 1,
    expectMatch: /NO_SUCH_FILE\.md 目标不存在/,
  },
  {
    name: 'check-boundaries B-1 抓 packages import apps',
    checker: 'check-boundaries.mjs',
    inject: () => tempFile('packages/shared/src/__negverify.ts', "import '@drsell/api';\nexport {};\n"),
    expect: 1,
    expectMatch: /B-1 违反/,
  },
  {
    name: 'check-boundaries B-2 抓 storefront 引 polaris（代码）',
    checker: 'check-boundaries.mjs',
    inject: () => tempFile('apps/storefront/src/__negverify.ts', "import '@shopify/polaris';\nexport {};\n"),
    expect: 1,
    expectMatch: /B-2 违反/,
  },
  {
    name: 'check-boundaries B-2 注释提及 polaris 必须不红',
    checker: 'check-boundaries.mjs',
    inject: () => tempFile('apps/storefront/src/__negverify.ts', '// 参考 @shopify/polaris 的 Card\nexport {};\n'),
    expect: 0,
  },
  {
    name: 'check-ratchet 抓欠账增加',
    checker: 'check-ratchet.mjs',
    inject: () => {
      const rel = 'spec/.unguarded-baseline.json';
      const prev = readFileSync(join(REPO_ROOT, rel), 'utf8');
      const obj = JSON.parse(prev);
      obj.soft_tenant_models -= 1;
      writeFileSync(join(REPO_ROOT, rel), JSON.stringify(obj, null, 2) + '\n');
      return () => writeFileSync(join(REPO_ROOT, rel), prev);
    },
    expect: 1,
    expectMatch: /soft_tenant_models: \d+ > 基线/,
  },
  {
    name: 'check-design DS-7 抓 ops 源码 hex',
    checker: 'check-design.mjs',
    inject: () => tempFile('apps/ops/app/__negverify.tsx', 'export const c = "#ff0000";\n'),
    expect: 1,
    expectMatch: /DS-7 违反/,
  },
  {
    name: 'check-design DS-7 注释里的 hex 必须不红',
    checker: 'check-design.mjs',
    inject: () => tempFile('apps/ops/app/__negverify.tsx', '// 原稿是 #ff0000\nexport {};\n'),
    expect: 0,
  },
  {
    name: 'check-design DS-8 抓两套令牌撞色',
    checker: 'check-design.mjs',
    inject: () => patchFile('apps/ops/app/tokens.css', '  --trial: #dec29a;', '  --trial: #006c49;'),
    expect: 1,
    expectMatch: /共用色值/,
  },
  {
    name: 'check-design DS-9 抓暗色块缺令牌',
    checker: 'check-design.mjs',
    inject: () => patchFile('apps/ops/app/tokens.css', '    --lost: #ffb4ab;\n', ''),
    expect: 1,
    expectMatch: /暗色块缺令牌/,
  },
  {
    name: '格式契约 7：DESIGN.md 缺 DS 论证锚点应红',
    checker: 'check-links.mjs',
    inject: () => patchFile('DESIGN.md', '### `DS-3`', '### DS-3 缺反引号'),
    expect: 1,
    expectMatch: /缺论证锚点：DS-3/,
  },
  {
    name: '格式契约 7：正文提及 ID 不算论证锚点',
    checker: 'check-links.mjs',
    inject: () => patchFile('DESIGN.md', '### `DS-3`', '这里提一句 `DS-3`\n\n### DS-3'),
    expect: 1,
    expectMatch: /缺论证锚点：DS-3/,
  },
];

const gitStatus = () =>
  execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });

console.log('== negative-verify ==');
const before = gitStatus();
let fails = 0;

for (const c of CASES) {
  const clean = run(c.checker);
  if (clean.code !== 0) {
    console.log(`  ✗ ${c.name}: 干净状态下 ${c.checker} 退出 ${clean.code}，应为 0`);
    fails++;
    continue;
  }

  let restore = () => {};
  let res;
  try {
    restore = c.inject();
    res = run(c.checker);
  } catch (e) {
    console.log(`  ✗ ${c.name}: 注入抛错 — ${e.message}`);
    fails++;
    continue;
  } finally {
    restore();
  }

  if (res.code !== c.expect) {
    console.log(`  ✗ ${c.name}: 退出 ${res.code}，期望 ${c.expect}`);
    fails++;
  } else if (c.expectMatch && !c.expectMatch.test(res.out)) {
    console.log(`  ✗ ${c.name}: 退出码对，但输出未匹配 ${c.expectMatch}`);
    console.log(res.out.split('\n').map((l) => `      ${l}`).join('\n'));
    fails++;
  } else {
    console.log(`  ✓ ${c.name}（退出 ${res.code}）`);
  }
}

const after = gitStatus();
if (before !== after) {
  console.log('  ✗ 工作区未还原：git status 前后不一致');
  console.log(`--- 前 ---\n${before}--- 后 ---\n${after}`);
  fails++;
} else {
  console.log('  ✓ 工作区已还原（git status 前后一致）');
}

console.log(`  ${CASES.length - fails} pass / ${fails} fail`);
process.exit(fails ? 1 : 0);

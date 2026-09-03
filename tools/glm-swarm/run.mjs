#!/usr/bin/env node
// tools/glm-swarm/run.mjs — GLM 并行编排入口。
//
// 用法：
//   node tools/glm-swarm/run.mjs --list
//   node tools/glm-swarm/run.mjs --task doc-drift
//   node tools/glm-swarm/run.mjs --dry-run            # 不调模型，只看分片与语料规模
//   GLM_CONCURRENCY=4 node tools/glm-swarm/run.mjs
//
// 退出码：0 正常（有无发现都算正常）｜1 有工作单元操作性失败｜2 配置或任务定义非法。
// 这是候选生成器，不是门禁，所以「有发现」不会让它非零退出，也不该接进 pnpm test。

import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { GlmClient, resolveConfig, estimateCost } from './client.mjs';
import { Pool, fanout, summarize } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(HERE, 'tasks');

const { values: argv } = parseArgs({
  options: {
    task: { type: 'string', multiple: true },
    concurrency: { type: 'string' },
    retries: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    out: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (argv.help) {
  console.log(`GLM 并行编排 runner

  --task <id>       只跑指定任务（可重复）
  --concurrency <n> 覆盖 GLM_CONCURRENCY
  --retries <n>     结构校验失败的回灌重试次数
  --dry-run         不调模型，只打印分片与语料规模
  --list            列出已注册任务
  --out <dir>       报告输出目录（默认 tools/glm-swarm/.runs/<时间戳>）
`);
  process.exit(0);
}

/**
 * 加载任务并强制纪律：verify 是必填字段。
 * 没有确定性校验器的任务一律拒绝运行 —— 否则 GLM 就成了唯一裁判。
 */
export async function loadTasks(dir = TASKS_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.task.mjs')).sort();
  const tasks = [];
  const errors = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    const t = mod.default;
    const where = `tasks/${f}`;
    if (!t || typeof t !== 'object') { errors.push(`${where}: 缺少默认导出的任务对象`); continue; }
    for (const [field, kind] of [['id', 'string'], ['collect', 'function'], ['prompt', 'function'], ['verify', 'function']]) {
      // eslint-disable-next-line valid-typeof
      if (typeof t[field] !== kind) errors.push(`${where}: 字段 ${field} 必须是 ${kind}${field === 'verify' ? '（纪律：GLM 只提候选，判定必须由确定性 verify 给出）' : ''}`);
    }
    if (!t.schema || typeof t.schema !== 'object') errors.push(`${where}: 缺少 schema（只有 json_object，没有 json_schema 强约束，必须自校验）`);
    if (errors.length === 0) tasks.push(t);
  }
  if (errors.length) { const e = new Error(`任务定义非法：\n  - ${errors.join('\n  - ')}`); e.code = 'INVALID_TASK'; throw e; }
  return tasks;
}

async function main() {
  let tasks;
  try {
    tasks = await loadTasks();
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(2); }

  if (argv.task?.length) {
    const want = new Set(argv.task.flatMap((s) => s.split(',')));
    tasks = tasks.filter((t) => want.has(t.id));
    if (tasks.length === 0) { console.error(`✗ 没有匹配的任务：${[...want].join(', ')}`); process.exit(2); }
  }

  if (argv.list) {
    for (const t of tasks) console.log(`  ${t.id.padEnd(24)} ${t.description ?? ''}`);
    process.exit(0);
  }

  const cfg = resolveConfig({ concurrency: argv.concurrency, retries: argv.retries });

  // 采集：纯确定性，不经模型
  const units = [];
  for (const t of tasks) {
    const items = await t.collect();
    for (const item of items) {
      units.push({ taskId: t.id, shardId: item.shardId ?? String(units.length), item, schema: t.schema, verify: t.verify.bind(t), prompt: t.prompt(item) });
    }
  }

  console.log(`== GLM 并行编排 ==`);
  console.log(`  模型      ${cfg.model}`);
  console.log(`  端点      ${cfg.baseUrl}  (region=${cfg.region})`);
  console.log(`  密钥来源  ${cfg.keySource}`);
  console.log(`  并发上限  ${cfg.concurrency}   回灌重试 ${cfg.retries}`);
  console.log(`  任务      ${tasks.map((t) => t.id).join(', ')}`);
  console.log(`  工作单元  ${units.length}`);

  if (argv['dry-run']) {
    for (const u of units) {
      console.log(`  · ${u.taskId}/${u.shardId}  prompt≈${(u.prompt.system.length + u.prompt.user.length)} 字符`);
    }
    console.log('\n(dry-run，未调用模型)');
    process.exit(0);
  }

  if (!cfg.apiKey) {
    console.error('\n✗ 未找到 GLM_API_KEY。设置环境变量，或写入 ~/.drsell-secrets/creds.env。');
    console.error('  先用 --dry-run 可以在没有 key 的情况下检查分片与语料。');
    process.exit(2);
  }

  const pool = new Pool(cfg.concurrency);
  const client = new GlmClient(cfg, {
    onRateLimit: (v) => {
      const changed = pool.degrade();
      console.warn(`  ! 限流（code=${v.code || 'HTTP429'}）${changed ? ` → 并发降至 ${pool.limit}` : ''}`);
    },
  });

  const started = Date.now();
  const results = await fanout(units, {
    client, pool, retries: cfg.retries,
    onEvent: (ev) => {
      if (ev.type === 'schema-retry') console.warn(`  ! ${ev.unit.taskId}/${ev.unit.shardId} 结构校验失败，第 ${ev.attempt} 次回灌重试`);
      if (ev.type === 'call-failed') console.warn(`  ✗ ${ev.unit.taskId}/${ev.unit.shardId} 调用失败：${ev.error}`);
      if (ev.type === 'verified') console.log(`  ✓ ${ev.unit.taskId}/${ev.unit.shardId} 保留 ${ev.kept} / 丢弃 ${ev.dropped}`);
    },
  });

  const sum = summarize(results, client, cfg.region);
  const outDir = argv.out ?? join(HERE, '.runs', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.json'), JSON.stringify({ config: redactCfg(cfg), summary: sum, results }, null, 2));
  writeFileSync(join(outDir, 'report.md'), renderMarkdown(sum, results, cfg, Date.now() - started));

  printSummary(sum, Date.now() - started, outDir);
  const operationalFailures = results.filter((r) => r.status === 'call-failed' || r.status === 'verify-threw').length;
  process.exit(operationalFailures > 0 ? 1 : 0);
}

function redactCfg(cfg) { return { ...cfg, apiKey: cfg.apiKey ? `<redacted:${cfg.apiKey.length}>` : '' }; }

function printSummary(sum, ms, outDir) {
  const u = sum.usage, c = sum.cost;
  console.log(`\n== 汇总 ==`);
  console.log(`  工作单元  ${sum.units}  ${JSON.stringify(sum.byStatus)}`);
  console.log(`  确认发现  ${sum.keptFindings}    被校验器丢弃的候选  ${sum.droppedCandidates}`);
  console.log(`  调用      ${u.calls} 次，限流命中 ${u.rateLimitHits} 次，耗时 ${(ms / 1000).toFixed(1)}s`);
  console.log(`  token     输入 ${u.promptTokens}（其中缓存 ${u.cachedTokens}） / 输出 ${u.completionTokens}（其中思考 ${u.reasoningTokens}）`);
  console.log(`  估算成本  ${c.cost} ${c.currency}（${c.tier === 'promo' ? `促销价，${c.promoEnds} 截止` : '标准价'}）`);
  if (!c.confirmed) console.log(`  ! 该区价目未官方确认：${c.source}，仅供粗估，以控制台账单为准`);
  if (u.reasoningTokens > 0) console.log(`  ! 思考不可关闭：本次 ${u.reasoningTokens} 个思考 token 计入输出计费`);
  console.log(`\n  报告  ${outDir}/report.md`);
}

function renderMarkdown(sum, results, cfg, ms) {
  const L = [`# GLM 编排运行报告`, ``, `- 时间：${new Date().toISOString()}`, `- 模型：${cfg.model} @ ${cfg.baseUrl}`,
    `- 工作单元：${sum.units}，耗时 ${(ms / 1000).toFixed(1)}s`,
    `- 确认发现：**${sum.keptFindings}**，被确定性校验器丢弃的候选：${sum.droppedCandidates}`,
    `- token：输入 ${sum.usage.promptTokens} / 输出 ${sum.usage.completionTokens}（思考 ${sum.usage.reasoningTokens}）`,
    `- 估算成本：${sum.cost.cost} ${sum.cost.currency}（${sum.cost.tier}）${sum.cost.confirmed ? '' : ' — 价目未官方确认，仅供粗估'}`, ``,
    `> GLM 只产出候选，以下每条「确认发现」都已通过该任务的确定性校验器复核。`, ``, `## 确认发现`, ``];
  let n = 0;
  for (const r of results) {
    for (const f of r.kept) {
      n++;
      L.push(`### ${n}. [${r.taskId}/${r.shardId}] ${f.summary ?? f.why ?? f.target ?? ''}`);
      L.push('```json', JSON.stringify(f, null, 2), '```', '');
    }
  }
  if (n === 0) L.push('_无_', '');
  L.push(`## 被丢弃的候选（模型报了但校验器不认）`, ``);
  let d = 0;
  for (const r of results) {
    for (const x of r.dropped) { d++; L.push(`- **[${r.taskId}/${r.shardId}]** ${x.reason}`); }
  }
  if (d === 0) L.push('_无_');
  L.push('', `## 未完成的工作单元`, '');
  const bad = results.filter((r) => r.status !== 'ok');
  if (bad.length === 0) L.push('_无_');
  for (const r of bad) L.push(`- **[${r.taskId}/${r.shardId}]** ${r.status}（尝试 ${r.attempts} 次）：${r.error ?? ''}`);
  return L.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`✗ ${e.stack ?? e.message}`); process.exit(1); });
}

export { renderMarkdown };

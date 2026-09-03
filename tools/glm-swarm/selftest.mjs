#!/usr/bin/env node
// tools/glm-swarm/selftest.mjs — 离线自测。不需要 GLM_API_KEY，不发真实请求。
// 用 mock fetch 验证编排的关键逻辑：并发扇出、限流退避与自适应降并发、
// 结构校验、失败回灌重试、确定性 verify 丢弃候选、成本计量、密钥脱敏、纪律强制。
//
// 运行：node tools/glm-swarm/selftest.mjs

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GlmClient, chatEndpoint, estimateCost, classifyResponse, backoffDelay, resolveConfig, parseEnvFile } from './client.mjs';
import { Pool, fanout, validateShape, extractJson, summarize } from './lib.mjs';
import { redactSecrets } from './repo.mjs';
import { loadTasks } from './run.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(t) { results.push(`\n== ${t} ==`); }

const okBody = (content, usage) => ({
  status: 200,
  body: {
    choices: [{ message: { content, reasoning_content: '思考内容' } }],
    usage: usage ?? { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 30 }, prompt_tokens_details: { cached_tokens: 20 } },
  },
});

/** mock fetch：responder(callIndex, requestBody) → {status, body}；可选 delayMs 模拟并发。 */
function mockFetch(responder, { delayMs = 0, track = null } = {}) {
  let i = 0;
  const calls = [];
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    if (track) { track.inflight++; track.peak = Math.max(track.peak, track.inflight); }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (track) track.inflight--;
    const r = responder(i++, body);
    return { status: r.status ?? 200, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

const cfg = (over = {}) => resolveConfig({ apiKey: 'test-key', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/', ...over }, {});
const noSleep = async () => {};
const unit = (over = {}) => ({
  taskId: 't', shardId: 's', item: {},
  prompt: { system: 'sys', user: 'usr' },
  schema: { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } } },
  verify: (parsed) => ({ kept: parsed.findings, dropped: [] }),
  ...over,
});

// ---------------------------------------------------------------------------
section('1. endpoint 拼接（结尾斜杠坑）');
check('国内 base 带斜杠拼接正确', chatEndpoint('https://open.bigmodel.cn/api/paas/v4/') === 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
check('国际 base 不带斜杠拼接正确', chatEndpoint('https://api.z.ai/api/paas/v4') === 'https://api.z.ai/api/paas/v4/chat/completions');
check('多余斜杠被归一', chatEndpoint('https://x/v4///') === 'https://x/v4/chat/completions');

// ---------------------------------------------------------------------------
section('2. 结构校验（因为没有 json_schema 强约束）');
const sch = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', minItems: 1, items: { type: 'object', required: ['line'], properties: { line: { type: 'integer', minimum: 1 } } } } } };
check('合法结构零错误', validateShape({ findings: [{ line: 3 }] }, sch).length === 0);
check('缺必填字段被抓到', validateShape({}, sch).some((e) => e.includes('findings')));
check('类型不符被抓到', validateShape({ findings: 'x' }, sch).some((e) => e.includes('type=array')));
check('嵌套整数约束被抓到', validateShape({ findings: [{ line: 0 }] }, sch).some((e) => e.includes('不得小于')));
check('小数不算 integer', validateShape({ findings: [{ line: 1.5 }] }, sch).some((e) => e.includes('type=integer')));
check('enum 被抓到', validateShape('z', { type: 'string', enum: ['a', 'b'] }).length === 1);
check('minItems 被抓到', validateShape({ findings: [] }, sch).some((e) => e.includes('至少 1 项')));

section('3. JSON 抽取容错');
check('裸 JSON', extractJson('{"a":1}').value.a === 1);
check('```json 围栏', extractJson('```json\n{"a":2}\n```').value.a === 2);
check('前后有废话', extractJson('好的：\n{"a":3}\n以上').value.a === 3);
check('非 JSON 返回失败', extractJson('完全不是 JSON').ok === false);

// ---------------------------------------------------------------------------
section('4. 限流分类与退避');
check('HTTP 429 → rate-limit', classifyResponse(429, {}).kind === 'rate-limit');
check('业务码 1302 → rate-limit', classifyResponse(200, { error: { code: '1302' } }).kind === 'rate-limit');
check('业务码 1305 → rate-limit', classifyResponse(200, { error: { code: '1305' } }).kind === 'rate-limit');
check('500 → transient', classifyResponse(500, {}).kind === 'transient');
check('401 → fatal', classifyResponse(401, {}).kind === 'fatal');
const d0 = backoffDelay(0, { random: () => 1 }), d3 = backoffDelay(3, { random: () => 1 });
check('退避随尝试次数指数增长', d3 > d0, `d0=${d0} d3=${d3}`);
check('退避有上限', backoffDelay(20, { random: () => 1 }) <= 20000);
check('抖动生效（下界为一半）', backoffDelay(2, { random: () => 0 }) === Math.round(800 * 4 * 0.5));

// ---------------------------------------------------------------------------
section('5. 限流退避后成功 + 自适应降并发');
{
  const pool = new Pool(8);
  let degraded = 0;
  const f = mockFetch((i) => (i < 2 ? { status: 429, body: { error: { code: '1302', message: '超速率' } } } : okBody('{"findings":[]}')));
  const client = new GlmClient(cfg(), { fetch: f, sleep: noSleep, onRateLimit: () => { pool.degrade(); degraded++; } });
  const r = await client.chat([{ role: 'user', content: 'x' }]);
  check('限流两次后重试成功', r.content === '{"findings":[]}');
  check('共发起 3 次请求', f.calls.length === 3, `实际 ${f.calls.length}`);
  check('限流命中被计数', client.usage.rateLimitHits === 2);
  check('并发被自适应下调 8→2', pool.limit === 2, `实际 ${pool.limit}`);
  check('onRateLimit 触发 2 次', degraded === 2);
}

section('6. 致命错误不重试');
{
  const f = mockFetch(() => ({ status: 401, body: { error: { code: '401', message: 'bad key' } } }));
  const client = new GlmClient(cfg(), { fetch: f, sleep: noSleep });
  let threw = null;
  try { await client.chat([{ role: 'user', content: 'x' }]); } catch (e) { threw = e; }
  check('401 直接抛出', threw?.name === 'FatalApiError');
  check('401 不重试（仅 1 次请求）', f.calls.length === 1, `实际 ${f.calls.length}`);
}

// ---------------------------------------------------------------------------
section('7. 并发扇出受上限约束');
{
  const track = { inflight: 0, peak: 0 };
  const f = mockFetch(() => okBody('{"findings":[]}'), { delayMs: 15, track });
  const pool = new Pool(3);
  const client = new GlmClient(cfg(), { fetch: f, sleep: noSleep });
  const units = Array.from({ length: 12 }, (_, i) => unit({ shardId: `s${i}` }));
  const res = await fanout(units, { client, pool, retries: 0 });
  check('12 个单元全部完成', res.length === 12 && res.every((r) => r.status === 'ok'));
  check('并发峰值未超上限 3', track.peak <= 3, `峰值 ${track.peak}`);
  check('确实并行了（峰值 > 1）', track.peak > 1, `峰值 ${track.peak}`);
  check('Pool 记录的峰值一致', pool.peak <= 3);
}

// ---------------------------------------------------------------------------
section('8. 结构校验失败 → 回灌重试');
{
  const f = mockFetch((i) => (i === 0 ? okBody('{"wrong":1}') : okBody('{"findings":[{"id":"a"}]}')));
  const client = new GlmClient(cfg(), { fetch: f, sleep: noSleep });
  const events = [];
  const res = await fanout([unit()], { client, pool: new Pool(1), retries: 2, onEvent: (e) => events.push(e) });
  check('回灌后成功', res[0].status === 'ok', res[0].error ?? '');
  check('用了 2 次尝试', res[0].attempts === 2, `实际 ${res[0].attempts}`);
  check('触发了 schema-retry 事件', events.some((e) => e.type === 'schema-retry'));
  const second = f.calls[1].body.messages;
  check('重试请求带上了完整对话（4 条消息）', second.length === 4, `实际 ${second.length}`);
  check('重试消息里回灌了校验错误原文', /缺少必填字段/.test(second[3].content), second[3]?.content?.slice(0, 60));
  check('重试消息要求只输出 JSON', /不要任何解释文字/.test(second[3].content));
}

section('9. 回灌到上限仍失败 → schema-failed');
{
  const f = mockFetch(() => okBody('{"wrong":1}'));
  const client = new GlmClient(cfg(), { fetch: f, sleep: noSleep });
  const res = await fanout([unit()], { client, pool: new Pool(1), retries: 2 });
  check('标记为 schema-failed', res[0].status === 'schema-failed');
  check('尝试了 3 次（1 + 2 重试）', res[0].attempts === 3, `实际 ${res[0].attempts}`);
  check('无发现被计入', res[0].kept.length === 0);
}

section('10. 调用彻底失败 → call-failed');
{
  const f = mockFetch(() => ({ status: 500, body: {} }));
  const client = new GlmClient(cfg({ transportRetries: 1 }), { fetch: f, sleep: noSleep });
  const res = await fanout([unit()], { client, pool: new Pool(1), retries: 0 });
  check('标记为 call-failed', res[0].status === 'call-failed', res[0].status);
}

// ---------------------------------------------------------------------------
section('11. 确定性 verify 丢弃候选（核心纪律）');
{
  const f = mockFetch(() => okBody('{"findings":[{"id":"real"},{"id":"fake"}]}'));
  const client = new GlmClient(cfg(), { fetch: f, sleep: noSleep });
  const res = await fanout([unit({
    verify: (parsed) => ({
      kept: parsed.findings.filter((x) => x.id === 'real'),
      dropped: parsed.findings.filter((x) => x.id !== 'real').map((x) => ({ finding: x, reason: '确定性复核不通过' })),
    }),
  })], { client, pool: new Pool(1), retries: 0 });
  check('只保留通过复核的候选', res[0].kept.length === 1 && res[0].kept[0].id === 'real');
  check('未通过的被丢弃并记录原因', res[0].dropped.length === 1 && res[0].dropped[0].reason === '确定性复核不通过');
}

section('12. verify 抛异常被隔离');
{
  const f = mockFetch(() => okBody('{"findings":[]}'));
  const client = new GlmClient(cfg(), { fetch: f, sleep: noSleep });
  const res = await fanout([unit({ verify: () => { throw new Error('boom'); } })], { client, pool: new Pool(1), retries: 0 });
  check('标记为 verify-threw 而非崩溃', res[0].status === 'verify-threw' && res[0].error === 'boom');
}

// ---------------------------------------------------------------------------
section('13. 用量与成本计量（思考不可关，必须可见）');
{
  const f = mockFetch(() => okBody('{"findings":[]}'));
  const client = new GlmClient(cfg(), { fetch: f, sleep: noSleep });
  await fanout([unit(), unit()], { client, pool: new Pool(2), retries: 0 });
  check('调用次数累加', client.usage.calls === 2);
  check('输入 token 累加', client.usage.promptTokens === 200);
  check('输出 token 累加', client.usage.completionTokens === 100);
  check('思考 token 单独统计', client.usage.reasoningTokens === 60, `实际 ${client.usage.reasoningTokens}`);
  check('缓存 token 单独统计', client.usage.cachedTokens === 40);
}
{
  const promoNow = Date.parse('2026-09-01T00:00:00+08:00');
  const listNow = Date.parse('2026-09-20T00:00:00+08:00');
  const u = { promptTokens: 1e6, completionTokens: 1e6, cachedTokens: 0 };
  const p = estimateCost(u, 'intl', promoNow);
  check('国际促销价算式正确 (0.075+0.25)', Math.abs(p.cost - 0.325) < 1e-9, `实际 ${p.cost}`);
  check('促销档被标记', p.tier === 'promo' && p.confirmed === true);
  const l = estimateCost(u, 'intl', listNow);
  check('促销截止后走标准价 (0.15+0.50)', Math.abs(l.cost - 0.65) < 1e-9, `实际 ${l.cost}`);
  const c = estimateCost({ promptTokens: 1e6, completionTokens: 5e5, cachedTokens: 5e5 }, 'intl', promoNow);
  check('缓存输入按缓存价计', Math.abs(c.cost - (0.5 * 0.075 + 0.5 * 0.015 + 0.5 * 0.25)) < 1e-9, `实际 ${c.cost}`);
  const cn = estimateCost(u, 'cn', promoNow);
  check('国内价目被标记为未确认', cn.confirmed === false && cn.currency === 'CNY');
}

// ---------------------------------------------------------------------------
section('14. 密钥脱敏（送模型前的最后一道闸）');
{
  const t = 'DB_PASSWORD=hunter2\nPORT=3000\nexport OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345\n"clientSecret": "s3cr3tvalue"\nurl = "postgres://u:pw@h:5432/db"\ntoken: abcd1234efgh\n';
  const r = redactSecrets(t);
  check('env 密码被抹', !r.includes('hunter2'));
  check('API key 被抹', !r.includes('sk-abcdefghijklmnopqrstuvwxyz012345'));
  check('JSON clientSecret 被抹', !r.includes('s3cr3tvalue'));
  check('DSN 内嵌密码被抹', !r.includes(':pw@'));
  check('YAML token 被抹', !r.includes('abcd1234efgh'));
  check('非密钥值保留（PORT=3000 用于比对不一致）', r.includes('PORT=3000'));
  check('键名保留（不一致判断靠键名）', r.includes('DB_PASSWORD') && r.includes('clientSecret'));
}

section('15. 密钥来源解析');
{
  check('env 优先', resolveConfig({}, { GLM_API_KEY: 'k1' }).keySource === 'env:GLM_API_KEY');
  check('无 key 时标记 none', resolveConfig({}, {}).apiKey === '' || resolveConfig({}, {}).keySource !== 'env:GLM_API_KEY');
  check('GLM_BASE_URL 可覆盖为 z.ai', resolveConfig({}, { GLM_BASE_URL: 'https://api.z.ai/api/paas/v4' }).region === 'intl');
  check('默认走国内端点', resolveConfig({}, {}).baseUrl.includes('bigmodel.cn'));
  const p = parseEnvFile('# c\nGLM_API_KEY="abc"\nX=1\n');
  check('creds.env 解析去引号', p.GLM_API_KEY === 'abc' && p.X === '1');
}

// ---------------------------------------------------------------------------
section('16. 纪律强制：缺 verify 的任务必须被拒绝');
{
  const dir = mkdtempSync(join(tmpdir(), 'glm-swarm-'));
  writeFileSync(join(dir, 'bad.task.mjs'), 'export default { id:"bad", collect:async()=>[], prompt:()=>({system:"",user:""}), schema:{type:"object"} };');
  let err = null;
  try { await loadTasks(dir); } catch (e) { err = e; }
  check('缺 verify 的任务被拒绝加载', err?.code === 'INVALID_TASK', err?.message ?? '竟然通过了');
  check('报错点名 verify 字段', /verify/.test(err?.message ?? ''));
  check('报错说明纪律理由', /只提候选/.test(err?.message ?? ''));

  writeFileSync(join(dir, 'bad.task.mjs'), 'export default { id:"ok2", collect:async()=>[], prompt:()=>({system:"",user:""}), verify:()=>({kept:[],dropped:[]}) };');
  let err2 = null;
  try { await loadTasks(dir); } catch (e) { err2 = e; }
  check('缺 schema 的任务被拒绝加载', err2?.code === 'INVALID_TASK');
  rmSync(dir, { recursive: true, force: true });
}

section('17. 真实任务定义合规');
{
  const tasks = await loadTasks();
  check('两个真实任务均通过纪律校验', tasks.length === 2, `实际 ${tasks.length}`);
  for (const t of tasks) check(`${t.id} 的 verify 是函数`, typeof t.verify === 'function');
}

section('18. 汇总输出');
{
  const client = new GlmClient(cfg(), { fetch: mockFetch(() => okBody('{"findings":[]}')), sleep: noSleep });
  const s = summarize([{ status: 'ok', kept: [1, 2], dropped: [3] }, { status: 'schema-failed', kept: [], dropped: [] }], client, 'intl');
  check('按状态分组', s.byStatus.ok === 1 && s.byStatus['schema-failed'] === 1);
  check('发现与丢弃计数', s.keptFindings === 2 && s.droppedCandidates === 1);
  check('带成本对象', typeof s.cost.cost === 'number');
}

console.log(results.join('\n'));
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);

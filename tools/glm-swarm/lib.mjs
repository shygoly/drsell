// tools/glm-swarm/lib.mjs — 编排层：并发池、结构校验、扇出 + 失败回灌重试。
//
// 纪律（强制，不是可选）：
//   GLM 只产出「候选」，最终判定必须来自任务自带的确定性 verify()。
//   verify 是必填字段，缺失的任务在加载期就被 run.mjs 拒绝，不会跑到这里。

import { estimateCost } from './client.mjs';

// ---------------------------------------------------------------------------
// 并发池：上限可在运行中下调（限流自适应），已入队任务不受影响。
// ---------------------------------------------------------------------------
export class Pool {
  constructor(limit = 3) {
    this.limit = Math.max(1, limit);
    this.active = 0;
    this.peak = 0;
    this.queue = [];
  }
  setLimit(n) { this.limit = Math.max(1, Math.floor(n)); this._drain(); }
  /** 限流时对半降并发，地板为 1。官方未公布配额，只能这样自适应。 */
  degrade() { const next = Math.max(1, Math.floor(this.limit / 2)); const changed = next !== this.limit; this.limit = next; return changed; }
  run(fn) {
    return new Promise((resolve, reject) => { this.queue.push({ fn, resolve, reject }); this._drain(); });
  }
  _drain() {
    while (this.active < this.limit && this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      this.active++;
      if (this.active > this.peak) this.peak = this.active;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => { this.active--; this._drain(); });
    }
  }
}

// ---------------------------------------------------------------------------
// 极简 JSON Schema 子集校验器。支持 type / required / properties / items /
// enum / minItems / minLength / minimum / maximum。返回错误字符串数组。
// 存在的理由：GLM 只有 json_object，没有 json_schema 强约束。
// ---------------------------------------------------------------------------
export function validateShape(value, schema, path = '$') {
  const errs = [];
  if (!schema || typeof schema !== 'object') return errs;

  const t = schema.type;
  if (t) {
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const ok =
      (t === 'integer' && Number.isInteger(value)) ||
      (t === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
      (t !== 'integer' && t !== 'number' && actual === t);
    if (!ok) { errs.push(`${path}: 期望 type=${t}，实际 ${actual}`); return errs; }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errs.push(`${path}: 必须是 ${JSON.stringify(schema.enum)} 之一，实际 ${JSON.stringify(value)}`);
  }
  if (typeof value === 'string' && schema.minLength != null && value.length < schema.minLength) {
    errs.push(`${path}: 字符串至少 ${schema.minLength} 字符`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: 不得小于 ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: 不得大于 ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      errs.push(`${path}: 数组至少 ${schema.minItems} 项，实际 ${value.length}`);
    }
    if (schema.items) value.forEach((v, i) => errs.push(...validateShape(v, schema.items, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errs.push(`${path}.${key}: 缺少必填字段`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) errs.push(...validateShape(value[key], sub, `${path}.${key}`));
    }
  }
  return errs;
}

/** 从模型返回里抠出 JSON。容忍 ```json 包裹与前后废话。 */
export function extractJson(text) {
  if (typeof text !== 'string') return { ok: false, error: '返回内容不是字符串' };
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (!s) return { ok: false, error: '返回内容为空' };
  try { return { ok: true, value: JSON.parse(s) }; } catch { /* 继续尝试截取 */ }
  const start = s.search(/[{[]/);
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    try { return { ok: true, value: JSON.parse(s.slice(start, end + 1)) }; } catch (e) { return { ok: false, error: `JSON 解析失败：${e.message}` }; }
  }
  return { ok: false, error: '返回内容中找不到 JSON' };
}

/**
 * 扇出执行。units 是 { taskId, shardId, prompt:{system,user}, schema, verify, item }。
 * 每个 unit 的生命周期：调用 → 抠 JSON → 结构校验（失败则把错误回灌重试）
 *                    → 确定性 verify() 过滤候选 → 产出 kept / dropped。
 */
export async function fanout(units, { client, pool, retries = 2, onEvent = () => {} } = {}) {
  const results = await Promise.all(units.map((unit) => pool.run(async () => {
    const messages = [
      { role: 'system', content: unit.prompt.system },
      { role: 'user', content: unit.prompt.user },
    ];
    let attempts = 0;
    let lastErrors = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      attempts = attempt + 1;
      let reply;
      try {
        reply = await client.chat(messages);
      } catch (e) {
        onEvent({ type: 'call-failed', unit, error: e.message });
        return { ...baseResult(unit), status: 'call-failed', attempts, error: e.message };
      }

      const parsed = extractJson(reply.content);
      if (!parsed.ok) {
        lastErrors = [parsed.error];
      } else {
        const errs = validateShape(parsed.value, unit.schema);
        if (errs.length === 0) {
          // ---- 确定性复核：模型说了不算，verify 说了才算 ----
          let verdict;
          try {
            verdict = await unit.verify(parsed.value, unit.item);
          } catch (e) {
            return { ...baseResult(unit), status: 'verify-threw', attempts, error: e.message };
          }
          const kept = verdict?.kept ?? [];
          const dropped = verdict?.dropped ?? [];
          onEvent({ type: 'verified', unit, kept: kept.length, dropped: dropped.length });
          return { ...baseResult(unit), status: 'ok', attempts, kept, dropped, usage: reply.usage };
        }
        lastErrors = errs;
      }

      // ---- 失败回灌：把校验错误原文喂回去，而不是盲目重试 ----
      if (attempt < retries) {
        onEvent({ type: 'schema-retry', unit, attempt: attempt + 1, errors: lastErrors });
        messages.push({ role: 'assistant', content: reply.content ?? '' });
        messages.push({
          role: 'user',
          content:
            `上一次返回不符合约定的 JSON 结构，校验器报告：\n${lastErrors.map((e) => `- ${e}`).join('\n')}\n\n` +
            `请只输出修正后的 JSON，不要任何解释文字、不要 markdown 代码围栏。`,
        });
      }
    }
    return { ...baseResult(unit), status: 'schema-failed', attempts, error: (lastErrors ?? []).join('; ') };
  })));

  return results;
}

function baseResult(unit) {
  return { taskId: unit.taskId, shardId: unit.shardId, kept: [], dropped: [], usage: null, error: null };
}

/** 汇总结果 + 用量 + 成本。 */
export function summarize(results, client, region, now = Date.now()) {
  const byStatus = {};
  let kept = 0, dropped = 0;
  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    kept += r.kept.length;
    dropped += r.dropped.length;
  }
  return {
    units: results.length,
    byStatus,
    keptFindings: kept,
    droppedCandidates: dropped,
    usage: client.usage,
    cost: estimateCost(client.usage, region, now),
  };
}

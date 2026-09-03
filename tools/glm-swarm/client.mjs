// tools/glm-swarm/client.mjs — GLM-5.3-Flash 客户端。零依赖，仅用 Node 18+ 内置 fetch。
//
// 三条硬约束塑造了这个文件（详见 docs/glm-orchestration.md §2）：
//   1. 思考不可关闭（thinking.type 只接受 enabled）→ 每次调用都产生 reasoning token，
//      必须计量并把成本打出来，不能假装它是"免费的快模型"。
//   2. 只有 json_object、没有 json_schema 强约束 → 结构校验放在 lib.mjs 客户端侧。
//   3. 限流是账户级并发数且官方未公布数值 → 传输层退避 + onRateLimit 回调让调用方降并发。

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/';
export const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
export const DEFAULT_MODEL = 'glm-5.3-flash';
export const SECRETS_FILE = join(homedir(), '.drsell-secrets', 'creds.env');

// 价目表（每百万 token）。促销期与截止日期来自 z.ai 官方定价页。
// 国内价为二手来源，standing = false，只做粗估，以控制台账单为准。
export const PRICING = {
  intl: {
    currency: 'USD', confirmed: true,
    source: 'https://docs.z.ai/guides/overview/pricing',
    list:  { input: 0.15,  cachedInput: 0.03,  output: 0.50 },
    promo: { input: 0.075, cachedInput: 0.015, output: 0.25 },
  },
  cn: {
    currency: 'CNY', confirmed: false,
    source: '二手中文报道聚合，未在 docs.bigmodel.cn 定价页直接核到',
    list:  { input: 0.8, cachedInput: null, output: 2.8 },
    promo: { input: 0.4, cachedInput: null, output: 1.4 },
  },
};
export const PROMO_ENDS = '2026-09-09T23:59:59+08:00';

export function promoActive(now = Date.now()) {
  return now <= Date.parse(PROMO_ENDS);
}

export function regionOf(baseUrl) {
  return /bigmodel\.cn/i.test(baseUrl) ? 'cn' : 'intl';
}

/** 解析 KEY=VALUE 文件（忽略注释与空行，去掉包裹引号）。 */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** 密钥来源顺序：显式参数 → 进程 env → ~/.drsell-secrets/creds.env。 */
export function resolveConfig(overrides = {}, env = process.env) {
  let apiKey = overrides.apiKey ?? env.GLM_API_KEY ?? '';
  let keySource = apiKey ? (overrides.apiKey ? 'argument' : 'env:GLM_API_KEY') : 'none';
  if (!apiKey && existsSync(SECRETS_FILE)) {
    try {
      const fileEnv = parseEnvFile(readFileSync(SECRETS_FILE, 'utf8'));
      if (fileEnv.GLM_API_KEY) { apiKey = fileEnv.GLM_API_KEY; keySource = SECRETS_FILE; }
    } catch { /* 读不到就当没有 */ }
  }
  const baseUrl = overrides.baseUrl ?? env.GLM_BASE_URL ?? DEFAULT_BASE_URL;
  return {
    apiKey, keySource, baseUrl,
    model: overrides.model ?? env.GLM_MODEL ?? DEFAULT_MODEL,
    concurrency: toInt(overrides.concurrency ?? env.GLM_CONCURRENCY, 3),
    retries: toInt(overrides.retries ?? env.GLM_RETRIES, 2),
    maxTokens: toInt(overrides.maxTokens ?? env.GLM_MAX_TOKENS, 8192),
    temperature: toNum(overrides.temperature ?? env.GLM_TEMPERATURE, 0.1),
    transportRetries: toInt(overrides.transportRetries ?? env.GLM_TRANSPORT_RETRIES, 4),
    region: regionOf(baseUrl),
  };
}

function toInt(v, d) { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }
function toNum(v, d) { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : d; }

/**
 * 拼接 endpoint。这里是 base URL 结尾斜杠坑的处置点：
 * 官方要求 openai SDK 用带斜杠的 base（少斜杠会静默失败），我们用裸 fetch 自己拼，
 * 所以统一剥掉结尾斜杠再补路径，带不带斜杠都对。
 */
export function chatEndpoint(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
}

export class RateLimitError extends Error {
  constructor(message, code) { super(message); this.name = 'RateLimitError'; this.code = code; }
}
export class FatalApiError extends Error {
  constructor(message, code, status) { super(message); this.name = 'FatalApiError'; this.code = code; this.status = status; }
}

/** 把 HTTP 状态 + 响应体归类成 rate-limit / transient / fatal。 */
export function classifyResponse(status, body) {
  const code = String(body?.error?.code ?? body?.code ?? '');
  const message = body?.error?.message ?? body?.msg ?? `HTTP ${status}`;
  // 1302 账户超速率、1305 平台过载 —— 均为可重试的限流信号
  if (status === 429 || code === '1302' || code === '1305') return { kind: 'rate-limit', code, message };
  if (status >= 500 || status === 408) return { kind: 'transient', code, message };
  if (status >= 400) return { kind: 'fatal', code, message };
  return { kind: 'ok', code, message };
}

export function backoffDelay(attempt, { base = 800, cap = 20000, random = Math.random } = {}) {
  const raw = Math.min(cap, base * 2 ** attempt);
  return Math.round(raw * (0.5 + random() * 0.5)); // 抖动 50%~100%
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GlmClient {
  constructor(config = {}, deps = {}) {
    this.cfg = config.apiKey !== undefined ? config : resolveConfig(config);
    this.fetchImpl = deps.fetch ?? globalThis.fetch;
    this.sleep = deps.sleep ?? sleep;
    this.random = deps.random ?? Math.random;
    this.onRateLimit = deps.onRateLimit ?? (() => {});
    this.usage = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cachedTokens: 0, rateLimitHits: 0 };
  }

  /** 单次对话调用。传输层错误（限流/5xx）在内部退避重试；结构校验不在这里。 */
  async chat(messages, { maxTokens, temperature } = {}) {
    const { apiKey, model, baseUrl, transportRetries } = this.cfg;
    if (!apiKey) throw new FatalApiError('缺少 GLM_API_KEY', 'NO_KEY', 0);

    const payload = {
      model,
      messages,
      stream: false,
      temperature: temperature ?? this.cfg.temperature,
      max_tokens: maxTokens ?? this.cfg.maxTokens,
      response_format: { type: 'json_object' }, // 只有 json_object，没有 json_schema
    };

    let lastErr;
    for (let attempt = 0; attempt <= transportRetries; attempt++) {
      let res, body;
      try {
        res = await this.fetchImpl(chatEndpoint(baseUrl), {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        body = await res.json().catch(() => ({}));
      } catch (e) {
        lastErr = e;
        if (attempt < transportRetries) { await this.sleep(backoffDelay(attempt, { random: this.random })); continue; }
        throw e;
      }

      const verdict = classifyResponse(res.status, body);
      if (verdict.kind === 'ok') {
        this._accumulate(body.usage);
        const choice = body.choices?.[0]?.message ?? {};
        return {
          content: choice.content ?? '',
          reasoning: choice.reasoning_content ?? '',
          usage: body.usage ?? {},
          raw: body,
        };
      }

      if (verdict.kind === 'rate-limit') {
        this.usage.rateLimitHits++;
        this.onRateLimit(verdict); // 通知编排层降并发
        lastErr = new RateLimitError(verdict.message, verdict.code);
      } else if (verdict.kind === 'transient') {
        lastErr = new Error(`${verdict.code || res.status}: ${verdict.message}`);
      } else {
        throw new FatalApiError(verdict.message, verdict.code, res.status);
      }

      if (attempt < transportRetries) await this.sleep(backoffDelay(attempt, { random: this.random }));
    }
    throw lastErr ?? new Error('调用失败且无错误信息');
  }

  _accumulate(u) {
    if (!u) { this.usage.calls++; return; }
    this.usage.calls++;
    this.usage.promptTokens += u.prompt_tokens ?? 0;
    this.usage.completionTokens += u.completion_tokens ?? 0;
    // 思考不可关，reasoning token 是真实成本的一部分，单独统计
    this.usage.reasoningTokens += u.completion_tokens_details?.reasoning_tokens ?? 0;
    this.usage.cachedTokens += u.prompt_tokens_details?.cached_tokens ?? 0;
  }
}

/** 用价目表把 token 用量折成钱。返回值含 confirmed 标注，调用方必须把它打出来。 */
export function estimateCost(usage, region = 'intl', now = Date.now()) {
  const table = PRICING[region] ?? PRICING.intl;
  const promo = promoActive(now);
  const rate = promo ? table.promo : table.list;
  const cached = usage.cachedTokens ?? 0;
  const freshInput = Math.max(0, (usage.promptTokens ?? 0) - cached);
  const cachedRate = rate.cachedInput ?? rate.input; // 国内无缓存档位，按输入价保守估
  const cost =
    (freshInput / 1e6) * rate.input +
    (cached / 1e6) * cachedRate +
    ((usage.completionTokens ?? 0) / 1e6) * rate.output;
  return {
    cost: Number(cost.toFixed(6)),
    currency: table.currency,
    tier: promo ? 'promo' : 'list',
    promoEnds: PROMO_ENDS,
    confirmed: table.confirmed,
    source: table.source,
  };
}

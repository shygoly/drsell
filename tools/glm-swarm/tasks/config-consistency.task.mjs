// tools/glm-swarm/tasks/config-consistency.task.mjs
// 配置一致性核对：跨 apps/*/.env、apps/web/shopify.app.toml、infra/、根配置找不一致。
//
// 扇出方式：同一份配置语料，按「不一致的类别」切成多个分片并行提问。
// 1M 上下文让整份语料能一次喂进去，所以分片切的是问题面而不是内容。
//
// verify 的确定性判据：模型给的每条 evidence 必须能在真实文件的真实行上原文命中，
// 且一条"不一致"至少要跨 2 个不同文件。定位不上的候选直接丢弃。

import { walk, buildCorpus, readRepoLine, looseIncludes, repoPathExists } from '../repo.mjs';

const ASPECTS = [
  { id: 'ports',    label: '端口号', hint: '同一个服务在不同文件里被写成不同端口，或文档/脚本引用了配置里不存在的端口。' },
  { id: 'urls',     label: '服务地址', hint: '同一个服务的 URL / 域名 / 主机名在不同文件里不一致。' },
  { id: 'env-keys', label: '环境变量键', hint: '某个 env 键在 .env.example 里有但在其它同类文件里缺失，或命名拼写不一致（如 API_URL vs APIURL）。' },
  { id: 'db',       label: '数据库连接', hint: '数据库主机、端口、库名、用户名在不同文件之间不一致。（值可能已脱敏，只比对未脱敏部分）' },
  { id: 'names',    label: '服务与进程名', hint: 'pm2 进程名、包名、workspace 名、容器名在不同文件之间不一致。' },
];

function collectFiles() {
  const files = [];
  for (const app of ['api', 'ops', 'storefront', 'web']) {
    files.push(...walk(`apps/${app}`, { depth: 1 }).filter((f) => /(^|\/)(\.env[^/]*|package\.json|.*\.toml)$/.test(f)));
  }
  files.push(...walk('infra', { exts: ['.json', '.cjs', '.sh', '.toml', '.yml', '.yaml', '.example'] }));
  for (const root of ['package.json', 'turbo.json', 'pnpm-workspace.yaml', 'tsconfig.base.json']) {
    if (repoPathExists(root)) files.push(root);
  }
  return [...new Set(files)].sort();
}

export default {
  id: 'config-consistency',
  description: '跨 apps/*/.env、shopify.app.toml、infra/、根配置查找配置不一致',

  async collect() {
    const files = collectFiles();
    if (files.length === 0) return [];
    const corpus = buildCorpus(files, { maxCharsPerFile: 12000 });
    return ASPECTS.map((aspect) => ({ shardId: aspect.id, aspect, files, corpus }));
  },

  prompt(item) {
    return {
      system:
        '你是配置审计助手。你只负责「提出候选」，最终判定由确定性校验器完成，所以宁可少报也不要编造。\n' +
        '所有 evidence 必须逐字摘自给定语料，path 与 line 必须与语料中的 "--- FILE: <path> ---" 和行号前缀严格对应。\n' +
        '注意：语料中形如 <redacted:N> 的内容是被脱敏的密钥值，不要就这些值本身报不一致。\n' +
        '只输出 JSON，不要任何解释文字。',
      user:
        `请只在「${item.aspect.label}」这一类别上查找配置不一致。\n` +
        `该类别的含义：${item.aspect.hint}\n\n` +
        `一条"不一致"必须跨至少 2 个不同文件，evidence 至少 2 条，每条给出 path、line（整数）、text（该行原文片段）。\n` +
        `如果这一类别没有发现问题，返回 {"findings": []}。\n\n` +
        `输出 JSON 结构：\n` +
        `{"findings":[{"kind":"${item.aspect.id}","summary":"一句话说明不一致在哪","evidence":[{"path":"...","line":1,"text":"..."}]}]}\n\n` +
        `配置语料：\n${item.corpus}`,
    };
  },

  schema: {
    type: 'object',
    required: ['findings'],
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          required: ['kind', 'summary', 'evidence'],
          properties: {
            kind: { type: 'string', enum: ASPECTS.map((a) => a.id) },
            summary: { type: 'string', minLength: 8 },
            evidence: {
              type: 'array', minItems: 2,
              items: {
                type: 'object', required: ['path', 'line', 'text'],
                properties: {
                  path: { type: 'string', minLength: 1 },
                  line: { type: 'integer', minimum: 1 },
                  text: { type: 'string', minLength: 2 },
                },
              },
            },
          },
        },
      },
    },
  },

  // ---- 确定性复核：模型说了不算 ----
  verify(parsed, item) {
    const kept = [], dropped = [];
    for (const f of parsed.findings ?? []) {
      const paths = new Set(f.evidence.map((e) => e.path));
      if (paths.size < 2) { dropped.push({ finding: f, reason: `不一致必须跨 ≥2 个文件，实际只涉及 ${paths.size} 个` }); continue; }

      const allowed = new Set(item.files);
      const bad = f.evidence.find((e) => !allowed.has(e.path));
      if (bad) { dropped.push({ finding: f, reason: `引用了不在本次语料内的文件：${bad.path}` }); continue; }

      let failed = null;
      for (const e of f.evidence) {
        const line = readRepoLine(e.path, e.line);
        if (line === null) { failed = `${e.path}:${e.line} 行不存在`; break; }
        if (!looseIncludes(line, e.text)) { failed = `${e.path}:${e.line} 实际内容与引文不符（实际："${line.trim().slice(0, 80)}"）`; break; }
      }
      if (failed) dropped.push({ finding: f, reason: failed });
      else kept.push(f);
    }
    return { kept, dropped };
  },
};

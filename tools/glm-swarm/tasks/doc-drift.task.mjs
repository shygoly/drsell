// tools/glm-swarm/tasks/doc-drift.task.mjs
// 文档漂移核对：拿文档里的断言对照真实代码，找过期描述。
//
// 真实痛点：CLAUDE.md 通篇写 Coze 集成，实际早已换成 wjclaw 上的 OpenClaw。
//
// 扇出方式：一个文档一个分片，天然并行。
//
// verify 的确定性判据（三类漂移各有对应的机器检查）：
//   missing-path   → 断言引用的路径必须在磁盘上「确实不存在」，存在则丢弃
//   missing-script → 断言引用的 npm script 必须在根 package.json 里「确实没有」，有则丢弃
//   stale-term     → 该术语必须在现役代码里「确实搜不到」，搜得到则丢弃
//
// stale-term 的搜索范围只含 apps/ 与 packages/（现役架构），刻意排除 chatbot*/ 等
// 历史遗留目录 —— 否则遗留代码会把"文档已过期"这个事实掩盖掉。

import { walk, readForPrompt, readRepoLine, looseIncludes, repoPathExists, grepRepo, rootPackageScripts } from '../repo.mjs';

const DRIFT_KINDS = ['missing-path', 'missing-script', 'stale-term'];
const LIVE_CODE_DIRS = ['apps', 'packages'];

function docCandidates() {
  const roots = ['CLAUDE.md', 'README.md', 'ARCHITECTURE.md', 'DESIGN.md', 'DECISIONS.md'].filter(repoPathExists);
  const docs = walk('docs', { exts: ['.md'], depth: 1 });
  return [...roots, ...docs];
}

/** 现役架构清单：给模型一个"真实长什么样"的参照面。 */
function repoInventory() {
  const dirs = [];
  for (const top of ['apps', 'packages', 'scripts', 'infra']) {
    const entries = walk(top, { depth: 2 });
    dirs.push(`${top}/: ${[...new Set(entries.map((e) => e.split('/').slice(0, 2).join('/')))].join(', ')}`);
  }
  return `${dirs.join('\n')}\n根 package.json scripts: ${[...rootPackageScripts()].join(', ')}`;
}

export default {
  id: 'doc-drift',
  description: '拿文档断言对照真实代码，找过期描述',

  async collect() {
    const inventory = repoInventory();
    const items = [];
    for (const docPath of docCandidates()) {
      const body = readForPrompt(docPath);
      if (!body || body.length < 200) continue;
      const numbered = body.split('\n').slice(0, 1200).map((l, i) => `${i + 1}| ${l}`).join('\n');
      items.push({ shardId: docPath, docPath, inventory, numbered });
    }
    return items;
  },

  prompt(item) {
    return {
      system:
        '你是文档漂移审计助手。你只负责「提出候选」，最终判定由确定性校验器完成。\n' +
        '校验器会真的去磁盘上查你给的 target，编造的条目会被丢弃并计入统计，所以宁可少报也不要猜。\n' +
        '只输出 JSON，不要任何解释文字。',
      user:
        `下面是文档 ${item.docPath}（带行号）和这个仓库的现役结构清单。\n` +
        `请找出文档里与现役结构不符的过期断言。每条必须归入以下三类之一，并给出可被机器验证的 target：\n` +
        `  - missing-path：文档提到某个文件/目录路径，但它已不存在。target = 该仓库相对路径。\n` +
        `  - missing-script：文档让人跑某个根 npm script，但它已不存在。target = script 名（不含 npm run）。\n` +
        `  - stale-term：文档围绕某个技术/服务展开，但该词在现役代码 apps/ 与 packages/ 里已完全搜不到。target = 该词。\n\n` +
        `quote 必须是 docLine 那一行的原文片段（至少 8 个字符）。docPath 必须是 "${item.docPath}"。\n` +
        `没有发现就返回 {"findings": []}。\n\n` +
        `输出 JSON 结构：\n` +
        `{"findings":[{"docPath":"${item.docPath}","docLine":1,"quote":"...","driftKind":"stale-term","target":"...","why":"一句话"}]}\n\n` +
        `=== 现役结构清单 ===\n${item.inventory}\n\n` +
        `=== 文档 ${item.docPath} ===\n${item.numbered}`,
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
          required: ['docPath', 'docLine', 'quote', 'driftKind', 'target', 'why'],
          properties: {
            docPath: { type: 'string', minLength: 1 },
            docLine: { type: 'integer', minimum: 1 },
            quote: { type: 'string', minLength: 8 },
            driftKind: { type: 'string', enum: DRIFT_KINDS },
            target: { type: 'string', minLength: 1 },
            why: { type: 'string', minLength: 4 },
          },
        },
      },
    },
  },

  // ---- 确定性复核：每一条都真的去磁盘上查 ----
  verify(parsed, item) {
    const kept = [], dropped = [];
    const scripts = rootPackageScripts();

    for (const f of parsed.findings ?? []) {
      if (f.docPath !== item.docPath) { dropped.push({ finding: f, reason: `docPath 越界：本分片是 ${item.docPath}` }); continue; }

      const line = readRepoLine(f.docPath, f.docLine);
      if (line === null) { dropped.push({ finding: f, reason: `${f.docPath}:${f.docLine} 行不存在` }); continue; }
      if (!looseIncludes(line, f.quote)) {
        dropped.push({ finding: f, reason: `${f.docPath}:${f.docLine} 引文无法定位（实际："${line.trim().slice(0, 80)}"）` });
        continue;
      }

      if (f.driftKind === 'missing-path') {
        if (repoPathExists(f.target)) { dropped.push({ finding: f, reason: `路径 ${f.target} 实际存在，断言不成立` }); continue; }
        kept.push({ ...f, verifiedBy: `repoPathExists("${f.target}") === false` });
      } else if (f.driftKind === 'missing-script') {
        if (scripts.has(f.target)) { dropped.push({ finding: f, reason: `script "${f.target}" 实际存在于根 package.json` }); continue; }
        kept.push({ ...f, verifiedBy: `根 package.json scripts 不含 "${f.target}"` });
      } else if (f.driftKind === 'stale-term') {
        if (f.target.length < 3) { dropped.push({ finding: f, reason: `target "${f.target}" 过短，搜索不可靠` }); continue; }
        const hits = grepRepo(f.target, { dirs: LIVE_CODE_DIRS, limit: 3 });
        if (hits.length > 0) { dropped.push({ finding: f, reason: `"${f.target}" 在现役代码中仍存在：${hits.join(', ')}` }); continue; }
        kept.push({ ...f, verifiedBy: `grep "${f.target}" 在 ${LIVE_CODE_DIRS.join('/')} 中零命中` });
      } else {
        dropped.push({ finding: f, reason: `未知 driftKind：${f.driftKind}` });
      }
    }
    return { kept, dropped };
  },
};

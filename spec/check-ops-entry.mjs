#!/usr/bin/env node
// spec/check-ops-entry.mjs — ADR-11 运营台独立域名入口守护。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, matchLines, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-ops-entry — 运营台入口');

const OPS_VHOST = 'infra/nginx/ops.szchada.top.conf';
const MERCHANT_VHOST = 'infra/nginx/drsell.szchada.top.conf';

if (!existsSync(join(REPO_ROOT, OPS_VHOST))) {
  r.fail(`ADR-11 违反：缺少 ${OPS_VHOST}`);
} else {
  const opsSrc = readFileSync(join(REPO_ROOT, OPS_VHOST), 'utf8');
  if (!/server_name\s+ops\.szchada\.top/.test(opsSrc)) {
    r.fail('ADR-11 违反：ops vhost 未声明 ops.szchada.top');
  } else {
    r.pass('ADR-11 ops vhost 存在且声明 ops.szchada.top');
  }
}

if (existsSync(join(REPO_ROOT, MERCHANT_VHOST))) {
  let bad = 0;
  for (const h of matchLines(MERCHANT_VHOST, /location\s+\^~\s+\/(?:ops|admin)\b/)) {
    r.fail(`ADR-11 违反：商家端 vhost 不得有 ${h.text}`);
    bad++;
  }
  if (!bad) r.pass('ADR-11 商家端 vhost 无 /ops 或 /admin location');
}

r.done();

#!/usr/bin/env node
import process from 'node:process';

const key = process.env.GLM_API_KEY;
const base = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
if (!key) {
  console.error('GLM_API_KEY is required');
  process.exit(2);
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'adp_search_products',
      description: 'Search products in the shop by keyword.',
      parameters: {
        type: 'object',
        properties: {
          shop: { type: 'string' },
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
];

const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'glm-4.5-flash',
    messages: [
      {
        role: 'system',
        content: 'You are a shop assistant. To look up products you must call adp_search_products.',
      },
      { role: 'user', content: 'Do you have any shoes in stock?' },
    ],
    tools,
    tool_choice: 'auto',
  }),
});

const body = await res.json();
if (!res.ok) {
  console.error('GLM HTTP', res.status, body.error?.message || body);
  process.exit(1);
}

const calls = body.choices?.[0]?.message?.tool_calls ?? [];
const names = calls.map((c) => c.function?.name);
if (!names.includes('adp_search_products')) {
  console.error('GLM did not call adp_search_products; got', names, 'finish', body.choices?.[0]?.finish_reason);
  process.exit(1);
}
console.log('glm_tool_calling_ok', names);

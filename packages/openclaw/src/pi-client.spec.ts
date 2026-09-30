import { PiSupportClient } from './pi-client';
import type { CreatePiSession, PiSessionHandle } from './pi-client';
import type { AdpQuery } from './adp-reader';

const query: AdpQuery = async () => [];

function handle(opts: {
  deltas?: string[];
  prompt?: () => Promise<void>;
}): PiSessionHandle {
  return {
    subscribe(listener) {
      for (const delta of opts.deltas ?? []) {
        listener({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta },
        });
      }
      return () => undefined;
    },
    prompt: opts.prompt ?? (async () => undefined),
    abort: async () => undefined,
    dispose() {
      /* captured by tests via jest.fn wrap */
    },
  };
}

describe('PiSupportClient', () => {
  it('把 text_delta 转成 onChunk', async () => {
    const chunks: string[] = [];
    const createSession: CreatePiSession = async () => handle({ deltas: ['Hel', 'lo'] });
    const client = new PiSupportClient({
      createSession,
      query,
      primaryModel: { id: 'primary' },
      fallbackModel: { id: 'fallback' },
    });
    const full = await client.chatStream({
      shopDomain: 'a.myshopify.com',
      visitorId: 'v',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: (c) => chunks.push(c),
    });
    expect(chunks.join('')).toBe('Hello');
    expect(full).toBe('Hello');
  });

  it('billing 时第二轮仍带 adp_search_products', async () => {
    const seen: string[][] = [];
    let round = 0;
    const createSession: CreatePiSession = async (input) => {
      seen.push(input.tools);
      round += 1;
      if (round === 1) {
        return handle({
          prompt: async () => {
            throw Object.assign(new Error('Insufficient Balance'), { status: 402 });
          },
        });
      }
      return handle({ deltas: ['ok'] });
    };
    const logs: unknown[] = [];
    const client = new PiSupportClient({
      createSession,
      query,
      primaryModel: { id: 'deepseek' },
      fallbackModel: { id: 'glm' },
      log: (row) => logs.push(row),
    });
    await client.chatStream({
      shopDomain: 'a.myshopify.com',
      visitorId: 'v',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'shoes?' }],
      onChunk: () => undefined,
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('adp_search_products');
    expect(seen[1]).toEqual(seen[0]);
    expect(logs[0]).toMatchObject({
      event: 'chat_agent_fallback',
      reason: 'billing',
      from: 'deepseek-v4/deepseek-v4-flash',
      to: 'zhipu/glm-4.5-flash',
    });
  });

  it('medusa 传给 createSession 的 tools 不含 adp_get_order', async () => {
    let tools: string[] = [];
    const createSession: CreatePiSession = async (input) => {
      tools = input.tools;
      return handle({ deltas: ['x'] });
    };
    const client = new PiSupportClient({
      createSession,
      query,
      primaryModel: {},
      fallbackModel: {},
    });
    await client.chatStream({
      shopDomain: 'a.myshopify.com',
      visitorId: 'v',
      source: 'medusa',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => undefined,
    });
    expect(tools).not.toContain('adp_get_order');
    expect(tools).toContain('adp_search_products');
  });

  it('非 billing 不切备用', async () => {
    let rounds = 0;
    const createSession: CreatePiSession = async () => {
      rounds += 1;
      return handle({
        prompt: async () => {
          throw new Error('timeout');
        },
      });
    };
    const client = new PiSupportClient({
      createSession,
      query,
      primaryModel: {},
      fallbackModel: {},
    });
    await expect(
      client.chatStream({
        shopDomain: 'a.myshopify.com',
        visitorId: 'v',
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        onChunk: () => undefined,
      }),
    ).rejects.toThrow('timeout');
    expect(rounds).toBe(1);
  });
});

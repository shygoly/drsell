export type OpenClawClientOptions = {
  gatewayUrl?: string;
  gatewayToken?: string;
  agentId?: string;
  fetchImpl?: typeof fetch;
};

export type OpenClawChatParams = {
  message: string;
  shopDomain: string;
  visitorId: string;
  conversationId?: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
};

function sessionKey(shopDomain: string, visitorId: string, conversationId?: string) {
  const conv = conversationId || visitorId;
  return `drsell:${shopDomain}:${conv}`;
}

/** Parse OpenAI-compatible SSE from OpenClaw /v1/chat/completions */
function parseOpenAiSseChunk(raw: string, state: { buffer: string }) {
  state.buffer += raw;
  const parts = state.buffer.split('\n\n');
  state.buffer = parts.pop() ?? '';
  const deltas: string[] = [];
  for (const block of parts) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const text = json.choices?.[0]?.delta?.content;
        if (text) deltas.push(text);
      } catch {
        // ignore partial JSON
      }
    }
  }
  return deltas.join('');
}

export class OpenClawClient {
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;
  private readonly agentId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenClawClientOptions = {}) {
    this.gatewayUrl = (options.gatewayUrl ?? process.env.OPENCLAW_GATEWAY_URL ?? 'http://127.0.0.1:18790').replace(/\/$/, '');
    this.gatewayToken = options.gatewayToken ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? '';
    this.agentId = options.agentId ?? process.env.OPENCLAW_AGENT_ID ?? 'main';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chatStream(params: OpenClawChatParams): Promise<string> {
    if (!this.gatewayToken) {
      throw new Error('OPENCLAW_GATEWAY_TOKEN 未配置');
    }
    const key = sessionKey(params.shopDomain, params.visitorId, params.conversationId);
    const userMessage =
      `[shop=${params.shopDomain}] ${params.message}\n` +
      '你是该 Shopify 店铺的客服。查商品/订单时只用 MCP 调用 adp_shop_summary、adp_search_products、adp_get_order，' +
      '且 shop 参数必须是上面的店铺域名。不要泄露地址、token 或其他店铺数据。';

    const res = await this.fetchImpl(`${this.gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.gatewayToken}`,
        'x-openclaw-agent-id': this.agentId,
        'x-openclaw-session-key': key,
      },
      body: JSON.stringify({
        model: `openclaw/${this.agentId}`,
        stream: true,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: params.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenClaw chat failed (${res.status}): ${text}`);
    }
    if (!res.body) {
      throw new Error('OpenClaw chat response missing body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const state = { buffer: '' };
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = decoder.decode(value, { stream: true });
      const delta = parseOpenAiSseChunk(piece, state);
      if (delta) {
        full += delta;
        params.onChunk(delta);
      }
    }
    return full;
  }
}

export function createOpenClawClient(options?: OpenClawClientOptions): OpenClawClient {
  return new OpenClawClient(options);
}

import { randomUUID } from 'node:crypto';
import type { OpenClawChatParams, OpenClawClientOptions } from './types';

/**
 * 每次请求一个**唯一**的会话键。
 *
 * 网关的会话记忆是真的：在隔离探针上实测过——同一 key 下，第二次请求即使
 * `messages` 里不含第一轮，模型照样答得出第一轮的口令；换成每请求唯一的 key，
 * 同样的第二次请求回 UNKNOWN。既然上下文已经由本地库全量组装（`ADR-17`），
 * 再复用稳定 key 就等于把历史发两遍。
 *
 * 前缀保留 shop 与会话 id，网关日志仍可按它归并同一条对话。
 */
function sessionKey(shopDomain: string, visitorId: string, conversationId?: string) {
  const conv = conversationId || visitorId;
  return `drsell:${shopDomain}:${conv}:${randomUUID()}`;
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
      throw new Error('OPENCLAW_GATEWAY_TOKEN is not configured');
    }
    if (params.messages.length === 0) {
      throw new Error('chatStream requires at least one message');
    }
    const key = sessionKey(params.shopDomain, params.visitorId, params.conversationId);

    const res = await this.fetchImpl(`${this.gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.gatewayToken}`,
        'x-openclaw-agent-id': this.agentId,
        // 每请求唯一：网关会按这个键累积自己的会话记忆，复用就会与我们
        // 自己组装的 messages 叠加成双份上下文。
        'x-openclaw-session-key': key,
      },
      body: JSON.stringify({
        model: `openclaw/${this.agentId}`,
        stream: true,
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages,
        ],
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

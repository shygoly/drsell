import { randomUUID } from 'crypto';

export type AdpChatContent = {
  Type: 'text';
  Text: string;
};

export type AdpChatRequest = {
  RequestId: string;
  ConversationId: string;
  AppKey: string;
  VisitorId: string;
  Contents: AdpChatContent[];
  Stream?: 'enable' | 'disable' | '';
  Incremental?: boolean;
};

export type AdpClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

/** ADP doc: 32-64 chars [a-zA-Z0-9_-] — UUID without dashes works */
export function adpSessionId(): string {
  return randomUUID().replace(/-/g, '');
}

const DEFAULT_SSE_URL = 'https://wss.lke.cloud.tencent.com/adp/v2/chat';

/** Parse ADP SSE stream; extract assistant text from text.delta / text.replace */
export function parseAdpSseChunk(raw: string, state: { buffer: string; text: string }) {
  state.buffer += raw;
  const parts = state.buffer.split('\n\n');
  state.buffer = parts.pop() ?? '';
  for (const block of parts) {
    const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
    if (!dataLine) continue;
    const jsonText = dataLine.slice(5).trim();
    if (!jsonText) continue;
    try {
      const evt = JSON.parse(jsonText) as { Type?: string; Text?: string };
      if (evt.Type === 'text.delta' && evt.Text) {
        state.text += evt.Text;
      } else if (evt.Type === 'text.replace' && evt.Text != null) {
        state.text = evt.Text;
      }
    } catch {
      // ignore partial JSON
    }
  }
  return state.text;
}

export class AdpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AdpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_SSE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chatSse(
    body: AdpChatRequest,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const res = await this.fetchImpl(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        Stream: 'enable',
        Incremental: true,
        ...body,
        RequestId: body.RequestId || adpSessionId(),
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ADP chat failed (${res.status}): ${text}`);
    }

    if (!res.body) {
      throw new Error('ADP chat response missing body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const state = { buffer: '', text: '' };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = decoder.decode(value, { stream: true });
      const text = parseAdpSseChunk(piece, state);
      onChunk(text);
    }
    return state.text;
  }

  async upsertKnowledgeDocument(params: {
    appKey: string;
    title: string;
    content: string;
    externalId: string;
  }): Promise<{ ok: true; externalId: string }> {
    if (!params.appKey || !params.content) {
      throw new Error('ADP upsertKnowledgeDocument requires appKey and content');
    }
    return { ok: true, externalId: params.externalId };
  }
}

export function createAdpClient(options?: AdpClientOptions): AdpClient {
  return new AdpClient(options);
}

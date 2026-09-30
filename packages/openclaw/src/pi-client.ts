import { type AdpQuery, createAdpQuery, createAdpReaderPool } from './adp-reader';
import { isBillingError } from './billing';
import { createAdpTools, type AdpToolDef } from './tools';
import type { OpenClawChatParams, SupportChatClient } from './types';

export type PiSessionInput = {
  model: unknown;
  tools: string[];
  customTools: unknown[];
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastUserText: string;
  signal?: AbortSignal;
};

export type PiSessionHandle = {
  subscribe: (
    listener: (event: {
      type: string;
      assistantMessageEvent?: { type: string; delta?: string };
    }) => void,
  ) => () => void;
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
};

export type CreatePiSession = (input: PiSessionInput) => Promise<PiSessionHandle>;

export type PiSupportClientOptions = {
  createSession?: CreatePiSession;
  query?: AdpQuery;
  primaryModel?: unknown;
  fallbackModel?: unknown;
  log?: (row: Record<string, unknown>) => void;
};

const PRIMARY_ID = 'deepseek-v4/deepseek-v4-flash';
const FALLBACK_ID = 'zhipu/glm-4.5-flash';

export class PiSupportClient implements SupportChatClient {
  private readonly createSession: CreatePiSession;
  private readonly primaryModel: unknown;
  private readonly fallbackModel: unknown;
  private readonly log: (row: Record<string, unknown>) => void;
  private queryImpl: AdpQuery | undefined;

  constructor(options: PiSupportClientOptions = {}) {
    this.createSession =
      options.createSession ??
      (async (input) => {
        const { createDefaultPiSession } = await import('./pi-session');
        return createDefaultPiSession(input);
      });
    this.primaryModel = options.primaryModel ?? { id: PRIMARY_ID };
    this.fallbackModel = options.fallbackModel ?? { id: FALLBACK_ID };
    this.log = options.log ?? ((row) => console.info(JSON.stringify(row)));
    this.queryImpl = options.query;
  }

  private query(): AdpQuery {
    if (!this.queryImpl) {
      this.queryImpl = createAdpQuery(createAdpReaderPool());
    }
    return this.queryImpl;
  }

  async chatStream(params: OpenClawChatParams): Promise<string> {
    if (params.messages.length === 0) {
      throw new Error('chatStream requires at least one message');
    }
    const last = params.messages[params.messages.length - 1];
    if (last.role !== 'user') {
      throw new Error('chatStream last message must be user');
    }
    const { names, tools } = createAdpTools({
      shopDomain: params.shopDomain,
      query: this.query(),
      source: params.source,
    });
    const history = params.messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));
    try {
      return await this.runRound({
        model: this.primaryModel,
        params,
        names,
        tools,
        history,
        lastUserText: last.content,
      });
    } catch (err) {
      if (!isBillingError(err)) throw err;
      this.log({
        event: 'chat_agent_fallback',
        reason: 'billing',
        from: PRIMARY_ID,
        to: FALLBACK_ID,
      });
      return await this.runRound({
        model: this.fallbackModel,
        params,
        names,
        tools,
        history,
        lastUserText: last.content,
      });
    }
  }

  private async runRound(opts: {
    model: unknown;
    params: OpenClawChatParams;
    names: string[];
    tools: AdpToolDef[];
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    lastUserText: string;
  }): Promise<string> {
    const session = await this.createSession({
      model: opts.model,
      tools: opts.names,
      customTools: opts.tools,
      systemPrompt: opts.params.systemPrompt,
      history: opts.history,
      lastUserText: opts.lastUserText,
      signal: opts.params.signal,
    });
    let full = '';
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        const delta = event.assistantMessageEvent.delta ?? '';
        if (delta) {
          full += delta;
          opts.params.onChunk(delta);
        }
      }
    });
    const onAbort = () => {
      void session.abort();
    };
    opts.params.signal?.addEventListener('abort', onAbort);
    try {
      await session.prompt(opts.lastUserText);
      return full;
    } finally {
      opts.params.signal?.removeEventListener('abort', onAbort);
      unsubscribe();
      session.dispose();
    }
  }
}

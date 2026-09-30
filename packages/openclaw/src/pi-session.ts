// pi-coding-agent@0.99.1
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertSafeToolAllowlist } from './tool-allowlist';
import type { AdpToolDef } from './tools';
import type { CreatePiSession, PiSessionHandle, PiSessionInput } from './pi-client';

function toTypeBoxParams(Type: typeof import('typebox').Type) {
  return Type.Object({
    shop: Type.Optional(Type.String()),
    query: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number()),
    order_id: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
  });
}

function historyToAgentMessages(
  history: PiSessionInput['history'],
  modelId: string,
  provider: string,
) {
  const now = Date.now();
  return history.map((m) => {
    if (m.role === 'user') {
      return { role: 'user' as const, content: m.content, timestamp: now };
    }
    return {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: m.content }],
      api: 'openai-completions' as const,
      provider,
      model: modelId,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop' as const,
      timestamp: now,
    };
  });
}

export const createDefaultPiSession: CreatePiSession = async (input: PiSessionInput) => {
  assertSafeToolAllowlist(input.tools);
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const { Type } = await import('typebox');
  const sdk = await import('@earendil-works/pi-coding-agent');
  const modelsPath = path.join(__dirname, '..', 'models.json');
  const emptyDir = mkdtempSync(path.join(os.tmpdir(), 'drsell-pi-'));
  if (!process.env.GLM_BASE_URL) {
    process.env.GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
  }

  const modelRuntime = await sdk.ModelRuntime.create({
    modelsPath,
    authPath: path.join(emptyDir, 'auth.json'),
  });
  await modelRuntime.setRuntimeApiKey('deepseek-v4', process.env.DEEPSEEK_API_KEY);
  if (process.env.GLM_API_KEY) {
    await modelRuntime.setRuntimeApiKey('zhipu', process.env.GLM_API_KEY);
  }

  const requestedId = String((input.model as { id?: string } | undefined)?.id ?? '');
  const wantFallback = /glm|zhipu|fallback/i.test(requestedId);
  const model = wantFallback
    ? modelRuntime.getModel('zhipu', 'glm-4.5-flash')
    : modelRuntime.getModel('deepseek-v4', 'deepseek-v4-flash');
  if (!model) {
    throw new Error(
      wantFallback
        ? 'zhipu/glm-4.5-flash is not available in models.json'
        : 'deepseek-v4/deepseek-v4-flash is not available in models.json',
    );
  }

  const customTools = (input.customTools as AdpToolDef[]).map((tool) =>
    sdk.defineTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: toTypeBoxParams(Type),
      execute: async (id: string, params: Record<string, unknown>) => tool.execute(id, params),
    }),
  );

  const loader = new sdk.DefaultResourceLoader({
    cwd: emptyDir,
    agentDir: emptyDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: input.systemPrompt,
  });
  await loader.reload();

  const { session } = await sdk.createAgentSession({
    sessionManager: sdk.SessionManager.inMemory(),
    model,
    modelRuntime,
    thinkingLevel: 'off',
    noTools: 'builtin',
    tools: input.tools,
    customTools,
    cwd: emptyDir,
    agentDir: emptyDir,
    resourceLoader: loader,
  });

  session.agent.state.messages = historyToAgentMessages(
    input.history,
    model.id,
    model.provider,
  );

  const handle: PiSessionHandle = {
    subscribe: (listener) =>
      session.subscribe((event) => {
        listener(event as {
          type: string;
          assistantMessageEvent?: { type: string; delta?: string };
        });
      }),
    prompt: (text) => session.prompt(text),
    abort: () => session.abort(),
    dispose: () => session.dispose(),
  };
  return handle;
};

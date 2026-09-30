export type {
  OpenClawChatParams,
  OpenClawClientOptions,
  OpenClawMessage,
  OpenClawRole,
  SupportChatClient,
  SupportPersona,
  SupportSource,
} from './types';
export { buildSupportSystemPrompt } from './prompt';
export { OpenClawClient } from './http-client';
export { PiSupportClient } from './pi-client';
import { OpenClawClient } from './http-client';
import { PiSupportClient } from './pi-client';
import type { OpenClawClientOptions, SupportChatClient } from './types';

export function createOpenClawClient(options?: OpenClawClientOptions): SupportChatClient {
  const mode = (options?.agent ?? process.env.CHAT_AGENT ?? 'pi').toLowerCase();
  if (mode === 'openclaw') return new OpenClawClient(options);
  return new PiSupportClient();
}

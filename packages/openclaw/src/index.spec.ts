import { createOpenClawClient } from './index';
import { OpenClawClient } from './http-client';
import { PiSupportClient } from './pi-client';

describe('createOpenClawClient', () => {
  const prev = process.env.CHAT_AGENT;
  afterEach(() => {
    if (prev === undefined) delete process.env.CHAT_AGENT;
    else process.env.CHAT_AGENT = prev;
  });

  it('未设置时走 Pi', () => {
    delete process.env.CHAT_AGENT;
    expect(createOpenClawClient()).toBeInstanceOf(PiSupportClient);
  });

  it('CHAT_AGENT=openclaw 走 HTTP', () => {
    process.env.CHAT_AGENT = 'openclaw';
    expect(createOpenClawClient()).toBeInstanceOf(OpenClawClient);
  });

  it('options.agent 覆盖 env', () => {
    process.env.CHAT_AGENT = 'openclaw';
    expect(createOpenClawClient({ agent: 'pi' })).toBeInstanceOf(PiSupportClient);
  });
});

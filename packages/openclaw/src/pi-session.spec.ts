import { createDefaultPiSession } from './pi-session';

describe('createDefaultPiSession', () => {
  it('createDefaultPiSession 在 SDK 前拒绝 bash', async () => {
    await expect(
      createDefaultPiSession({
        model: {},
        tools: ['bash'],
        customTools: [],
        systemPrompt: 's',
        history: [],
        lastUserText: 'hi',
      }),
    ).rejects.toThrow(/forbidden tool/i);
  });
});

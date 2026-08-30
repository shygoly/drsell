// pm2 must invoke the Node entrypoint directly; the `openclaw` CLI wrapper does not
// keep the gateway process alive under pm2 (pubmedclaw uses the same pattern on :18789).
const OPENCLAW_ENTRY =
  process.env.OPENCLAW_ENTRY ||
  '/usr/lib/node_modules/openclaw/dist/index.js';

module.exports = {
  apps: [
    {
      name: 'openclaw-drsell',
      script: OPENCLAW_ENTRY,
      args: '--profile drsell gateway run --port 18790 --bind loopback',
      interpreter: 'node',
      env: {
        OPENCLAW_STATE_DIR: '/root/.openclaw-drsell',
        OPENCLAW_CONFIG_PATH: '/root/.openclaw-drsell/openclaw.json',
      },
    },
  ],
};

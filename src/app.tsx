import { Hono } from 'hono';
import { countNight } from './digest/counts.js';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) => {
    const status = readStatus(config);
    const nights = status.nights.map((night) => ({ night, counts: countNight(config.runsDir, night) }));
    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} nights={nights} />
      </Layout>,
    );
  });

  return app;
}

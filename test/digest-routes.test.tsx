import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const entry = (at: string, job: string, status: string) =>
  JSON.stringify({ at, job, status, owner: 'rook', error: null });

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'digest-routes-'));
  writeFileSync(
    join(dir, '2026-02-01.jsonl'),
    [
      entry('2026-02-01T23:00:00+01:00', 'zeta/job', 'ok'),
      entry('2026-02-01T23:05:00+01:00', 'alpha/job', 'retry'),
      entry('2026-02-01T23:10:00+01:00', 'alpha/job', 'ok'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, '2026-02-02.jsonl'), '');
  writeFileSync(
    join(dir, '2026-02-03.jsonl'),
    [entry('2026-02-03T01:00:00+01:00', 'good/one', 'ok'), 'not json at all', entry('2026-02-03T02:00:00+01:00', 'good/two', 'fail')].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

const rowsOf = async (night: string) => (await (await app.request(`/api/digest/${night}`)).json()) as DigestRow[];

describe('GET /digest/:night', () => {
  it('renders a normal night', async () => {
    const res = await app.request('/digest/2026-02-01');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('alpha/job');
    expect(html).toContain('zeta/job');
    expect(html).toContain('2026-02-01T23:10:00+01:00');
  });

  it('404s a night with no file', async () => {
    expect((await app.request('/digest/2026-02-09')).status).toBe(404);
  });

  it('renders an empty night as nothing ran', async () => {
    const res = await app.request('/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('renders the good rows of a night with a bad line', async () => {
    const res = await app.request('/digest/2026-02-03');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('good/one');
    expect(html).toContain('good/two');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns rows for a normal night', async () => {
    const res = await app.request('/api/digest/2026-02-01');
    expect(res.status).toBe(200);
    const rows = (await res.json()) as DigestRow[];
    expect(rows.map((r) => r.job)).toEqual(['alpha/job', 'zeta/job']);
  });

  it('404s a night with no file', async () => {
    expect((await app.request('/api/digest/2026-02-09')).status).toBe(404);
  });

  it('returns an empty array for an empty night', async () => {
    const res = await app.request('/api/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns the good rows of a night with a bad line', async () => {
    const res = await app.request('/api/digest/2026-02-03');
    expect(res.status).toBe(200);
    expect((await rowsOf('2026-02-03')).map((r) => r.job)).toEqual(['good/one', 'good/two']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const jobs = (await rowsOf('2026-02-01')).map((r) => r.job);
    const html = await (await app.request('/digest/2026-02-01')).text();
    const pageJobs = [...html.matchAll(/<tr[^>]*><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(pageJobs).toEqual(jobs);
  });
});

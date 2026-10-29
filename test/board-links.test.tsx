import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { countRows } from '../src/digest/counts.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

function line(at: string, job: string, status: string) {
  return JSON.stringify({ at, job, status, owner: 'a', error: null });
}

describe('board digest links', () => {
  it('links the real nights with counts by last status', async () => {
    const html = await (await createApp({ ...base, runsDir: 'runs' }).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a> · ok 4 · retry 0 · fail 1');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a> · ok 4 · retry 0 · fail 0');
  });

  it('counts a retried-then-ok job once, as ok, and links an empty night with zeros', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-'));
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      [line('2026-01-02T01:00:00Z', 'x', 'retry'), line('2026-01-02T01:05:00Z', 'x', 'ok'), line('2026-01-02T01:06:00Z', 'y', 'fail')].join('\n') + '\n',
    );
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    const html = await (await createApp({ ...base, runsDir: dir }).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-01-02">2026-01-02</a> · ok 1 · retry 0 · fail 1');
    expect(html).toContain('<a href="/digest/2026-01-01">2026-01-01</a> · ok 0 · retry 0 · fail 0');
  });

  it('countRows of nothing is zeros', () => {
    expect(countRows([])).toEqual({ ok: 0, retry: 0, fail: 0 });
  });
});

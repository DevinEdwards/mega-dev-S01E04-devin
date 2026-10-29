import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestRow, NightDigest } from '../src/digest/types.js';

function row(digest: NightDigest | null, job: string): DigestRow | undefined {
  return digest?.rows.find((r) => r.job === job);
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('reads 5 jobs and 1 bad line', () => {
    expect(digest?.rows).toHaveLength(5);
    expect(digest?.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('lets the last status win and counts retries on their own', () => {
    expect(row(digest, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the error on a failed last line', () => {
    const backup = row(digest, 'notes/backup');
    expect(backup?.lastStatus).toBe('fail');
    expect(backup?.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    expect(row(digest, 'digest/render')?.owner).toBeNull();
  });

  it('keeps times as logged, offset included', () => {
    const sync = row(digest, 'lane/sync');
    expect(sync?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edge cases', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-10-30')).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    writeFileSync(join(dir, '2026-10-30.jsonl'), '');
    expect(readNight(dir, '2026-10-30')).toEqual({ rows: [], badLines: 0 });
  });

  it('treats a night that is not a date as missing', () => {
    writeFileSync(join(dir, 'secret.jsonl'), '{"at":"2026-10-30T01:00:00+01:00","job":"x","status":"ok"}\n');
    expect(readNight(dir, 'secret')).toBeNull();
    expect(readNight(dir, '../2026-10-28')).toBeNull();
    expect(readNight(dir, '2026-02-30')).toBeNull();
  });

  it('treats a non-string owner or error as missing', () => {
    writeFileSync(
      join(dir, '2026-10-30.jsonl'),
      [
        '{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"fail","owner":7,"error":{"code":1}}',
        '{"at":"2026-10-30T01:00:00+01:00","job":"b","status":"ok","owner":{"name":"rook"}}',
      ].join('\n'),
    );
    const digest = readNight(dir, '2026-10-30');
    expect(row(digest, 'a')?.owner).toBeNull();
    expect(row(digest, 'a')?.lastError).toBeNull();
    expect(row(digest, 'b')?.owner).toBeNull();
    expect(digest?.badLines).toBe(0);
  });

  it('keeps a row whose owner is already —', () => {
    writeFileSync(join(dir, '2026-10-30.jsonl'), '{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"ok","owner":"—"}\n');
    expect(readNight(dir, '2026-10-30')?.rows).toEqual([
      {
        job: 'a',
        owner: '—',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-30T01:00:00+01:00',
        lastAt: '2026-10-30T01:00:00+01:00',
      },
    ]);
  });

  it('skips blank lines without counting them', () => {
    writeFileSync(
      join(dir, '2026-10-30.jsonl'),
      '\n{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"ok"}\n\n   \n',
    );
    const digest = readNight(dir, '2026-10-30');
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.badLines).toBe(0);
  });

  it('counts lines missing or with invalid at, job or status as bad', () => {
    writeFileSync(
      join(dir, '2026-10-30.jsonl'),
      [
        'not json',
        'null',
        '[]',
        '{"job":"a","status":"ok"}',
        '{"at":"yesterday","job":"a","status":"ok"}',
        '{"at":"2026-10-30T01:00:00+01:00","status":"ok"}',
        '{"at":"2026-10-30T01:00:00+01:00","job":5,"status":"ok"}',
        '{"at":"2026-10-30T01:00:00+01:00","job":"a"}',
        '{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"done"}',
        '{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"ok"}',
      ].join('\n'),
    );
    const digest = readNight(dir, '2026-10-30');
    expect(digest?.badLines).toBe(9);
    expect(digest?.rows).toHaveLength(1);
  });
});

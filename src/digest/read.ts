import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const statuses: readonly string[] = ['ok', 'retry', 'fail'];

export function isNight(night: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  const date = new Date(`${night}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === night;
}

function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && statuses.includes(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { at, job, status } = record;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isRunStatus(status)) return null;
  return { at, job, status, owner: stringOrNull(record.owner), error: stringOrNull(record.error) };
}

function digestLines(text: string): NightDigest {
  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const parsed = parseLine(line);
    if (parsed === null) {
      badLines += 1;
      continue;
    }
    const lines = byJob.get(parsed.job);
    if (lines) lines.push(parsed);
    else byJob.set(parsed.job, [parsed]);
  }
  const rows: DigestRow[] = [...byJob.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([job, lines]) => {
      const first = lines[0]!;
      const last = lines[lines.length - 1]!;
      return {
        job,
        owner: last.owner,
        runs: lines.length,
        retries: lines.filter((l) => l.status === 'retry').length,
        lastStatus: last.status,
        lastError: last.error,
        firstAt: first.at,
        lastAt: last.at,
      };
    });
  return { rows, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return digestLines(text);
};

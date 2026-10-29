import { readNight } from './read.js';
import type { DigestRow, RunStatus } from './types.js';

export type StatusCounts = Record<RunStatus, number>;

export function countRows(rows: DigestRow[]): StatusCounts {
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of rows) counts[row.lastStatus] += 1;
  return counts;
}

export function countNight(runsDir: string, night: string): StatusCounts {
  return countRows(readNight(runsDir, night)?.rows ?? []);
}

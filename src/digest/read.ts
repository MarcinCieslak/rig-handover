import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// Parse at the edge (styleguide): a line is either a RunLine or it is bad.
export function parseLine(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || Number.isNaN(Date.parse(o.at))) return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (!STATUSES.includes(o.status as RunStatus)) return null;
  if (o.owner !== undefined && o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  const run: RunLine = { at: o.at, job: o.job, status: o.status as RunStatus, owner: o.owner ?? null };
  if (o.error !== undefined) run.error = o.error;
  return run;
}

export function digest(night: string, text: string): DigestNight {
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const run = parseLine(line);
    if (!run) {
      badLines++;
      continue;
    }
    counts[run.status]++;
    const runs = byJob.get(run.job) ?? [];
    runs.push(run);
    byJob.set(run.job, runs);
  }

  const rows = [...byJob.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([job, runs]) => row(job, runs));
  return { night, rows, counts, badLines };
}

function row(job: string, runs: RunLine[]): DigestRow {
  // Order by time; lines with the same instant keep their order in the file.
  const sorted = runs
    .map((run, i) => ({ run, i, t: Date.parse(run.at) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.run);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const lastError = [...sorted].reverse().find((r) => r.error !== undefined)?.error ?? null;
  return {
    job,
    owner: last.owner,
    runs: sorted.length,
    retries: sorted.filter((r) => r.status === 'retry').length,
    fails: sorted.filter((r) => r.status === 'fail').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  return digest(night, text);
};

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseLine, readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('has 5 jobs, sorted, and 1 bad line', () => {
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps retries, the last error and the offsets from the log', () => {
    const refresh = night.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('counts a fail and keeps a null owner', () => {
    const backup = night.rows.find((r) => r.job === 'notes/backup')!;
    expect([backup.fails, backup.lastStatus, backup.lastError]).toEqual([1, 'fail', 'quota exceeded']);
    expect(night.rows.find((r) => r.job === 'digest/render')!.owner).toBeNull();
  });

  it('does not count the cut-off last line as a lane/sync run', () => {
    const sync = night.rows.find((r) => r.job === 'lane/sync')!;
    expect([sync.runs, sync.retries, sync.lastAt]).toEqual([8, 1, '2026-10-29T05:00:04+01:00']);
  });
});

describe('readNight edges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a night with no file, or a name that is not a night', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('reads an empty file as a night where nothing ran', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts lines that parse but do not fit, and CRLF endings are fine', () => {
    writeFileSync(
      join(dir, '2026-01-03.jsonl'),
      [
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"maybe","owner":"x"}',
        '[1,2]',
        '{"job":"b","status":"ok"}',
        '',
      ].join('\r\n'),
    );
    const night = readNight(dir, '2026-01-03')!;
    expect(night.badLines).toBe(3);
    expect(night.rows).toHaveLength(1);
    expect(night.rows[0]!.owner).toBe('x');
  });

  it('treats a missing owner as null', () => {
    expect(parseLine('{"at":"2026-01-03T01:00:00Z","job":"a","status":"ok"}')?.owner).toBeNull();
  });
});

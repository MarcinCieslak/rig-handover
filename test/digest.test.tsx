import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import type { DigestRow, RunStatus } from '../src/digest/types.js';

const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2026-10-01';

const normalLines = [
  '{"at":"2026-10-28T01:00:00+01:00","job":"invoice-sync","status":"ok","owner":"ben"}',
  '{"at":"2026-10-28T01:05:00+01:00","job":"hourly-ping","status":"retry","owner":"ben"}',
  '{"at":"2026-10-28T01:06:00+01:00","job":"hourly-ping","status":"retry","owner":"ben"}',
  '{"at":"2026-10-28T01:07:00+01:00","job":"hourly-ping","status":"ok","owner":"ben"}',
  '{"at":"2026-10-28T01:10:00+01:00","job":"nightly-export","status":"retry","owner":"ana","error":"timeout"}',
  '{"at":"2026-10-28T01:20:00+01:00","job":"nightly-export","status":"retry","owner":"ana","error":"timeout"}',
  '{"at":"2026-10-28T01:30:00+01:00","job":"nightly-export","status":"retry","owner":"ana","error":"timeout"}',
  '{"at":"2026-10-28T01:40:00+01:00","job":"nightly-export","status":"ok","owner":"ana"}',
  '{"at":"2026-10-28T02:00:00+01:00","job":"cache-warm","status":"ok","owner":null}',
  '{"at":"2026-10-28T03:00:00+01:00","job":"invoice-sync","status":"fail","owner":"ben","error":"401 unauthorized"}',
];

const badLines = [
  '{"at":"2026-10-26T01:00:00+01:00","job":"invoice-sync","status":"ok","owner":"ben"}',
  'this line is not json',
  '{"at":"2026-10-26T01:30:00+01:00","job":"cache-warm","status":"ok","owner":null}',
];

const expectedRows: DigestRow[] = [
  {
    job: 'cache-warm',
    owner: null,
    runs: 1,
    retries: 0,
    fails: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T02:00:00+01:00',
    lastAt: '2026-10-28T02:00:00+01:00',
  },
  {
    job: 'hourly-ping',
    owner: 'ben',
    runs: 3,
    retries: 2,
    fails: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T01:05:00+01:00',
    lastAt: '2026-10-28T01:07:00+01:00',
  },
  {
    job: 'invoice-sync',
    owner: 'ben',
    runs: 2,
    retries: 0,
    fails: 1,
    lastStatus: 'fail',
    lastError: '401 unauthorized',
    firstAt: '2026-10-28T01:00:00+01:00',
    lastAt: '2026-10-28T03:00:00+01:00',
  },
  {
    job: 'nightly-export',
    owner: 'ana',
    runs: 4,
    retries: 3,
    fails: 0,
    lastStatus: 'ok',
    lastError: 'timeout',
    firstAt: '2026-10-28T01:10:00+01:00',
    lastAt: '2026-10-28T01:40:00+01:00',
  },
];

type DigestJson = {
  night: string;
  rows: DigestRow[];
  counts: Record<RunStatus, number>;
  badLines: number;
};

// Finds the table row that holds `job` and returns its opening tag (e.g. `<tr class="warn">`)
// and the text of the row, so checks can look at the row only.
function rowOf(html: string, job: string): { open: string; body: string } {
  const part = html.split('<tr').find((chunk) => chunk.includes(job));
  if (part === undefined) {
    throw new Error(`no table row for ${job}`);
  }
  const end = part.indexOf('>');
  const body = part.slice(end + 1).split('</tr>')[0];
  return { open: part.slice(0, end), body };
}

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), badLines.join('\n') + '\n');
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page', () => {
  it('answers 200 with one table for a normal night', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    expect(html).not.toContain('could not be read');
  });

  it('answers 404 when the night has no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(`no run log for ${MISSING}`);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('notes the unparseable line for a night with a bad line', async () => {
    const res = await app.request(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('1 line(s) could not be read');
  });

  it('marks a job with 3 or more retries and a job with a fail as warn', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(rowOf(html, 'nightly-export').open).toContain('class="warn"');
    expect(rowOf(html, 'invoice-sync').open).toContain('class="warn"');
  });

  it('does not mark a job with 2 retries or a clean job as warn', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(rowOf(html, 'hourly-ping').open).not.toContain('class="warn"');
    expect(rowOf(html, 'cache-warm').open).not.toContain('class="warn"');
  });

  it('shows a null owner as an em dash', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(rowOf(html, 'cache-warm').body).toContain('—');
  });

  it('lists the jobs in the same order as the JSON route', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const json = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as DigestJson;
    const jobs = json.rows.map((row) => row.job);
    const orderOnPage = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(jobs).toEqual(['cache-warm', 'hourly-ping', 'invoice-sync', 'nightly-export']);
    expect(orderOnPage).toEqual(jobs);
  });
});

describe('digest JSON', () => {
  it('answers 200 with the night, rows, counts and badLines', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as DigestJson;
    expect(json.night).toBe(NORMAL);
    expect(json.rows).toEqual(expectedRows);
    expect(json.counts).toEqual({ ok: 4, retry: 5, fail: 1 });
    expect(json.badLines).toBe(0);
  });

  it('answers 404 with an error body when the night has no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });

  it('answers 200 with no rows and zero counts for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as DigestJson;
    expect(json.night).toBe(EMPTY);
    expect(json.rows).toEqual([]);
    expect(json.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
    expect(json.badLines).toBe(0);
  });

  it('counts the unparseable line as badLines 1 and still returns the other rows', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as DigestJson;
    expect(json.badLines).toBe(1);
    expect(json.rows.map((row) => row.job)).toEqual(['cache-warm', 'invoice-sync']);
    expect(json.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
  });
});

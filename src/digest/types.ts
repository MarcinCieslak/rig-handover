// Plan morning-digest § 1. The contract every part of § 2 builds against: change it only with
// the reader, never from a view or a route.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after it parsed and checked out.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night. Times keep the offset from the log (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line; null renders as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  fails: number; // lines with status `fail`
  lastStatus: RunStatus; // status of the job's last line
  lastError: string | null; // most recent `error` seen for the job, even if it later went ok
  firstAt: string;
  lastAt: string;
};

export type DigestNight = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; empty when nothing ran
  counts: Record<RunStatus, number>; // lines per status, over the whole night
  badLines: number; // lines that did not parse or did not fit RunLine; counted, never thrown
};

// null when the night has no file (or the name is not a YYYY-MM-DD night): routes answer 404.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;

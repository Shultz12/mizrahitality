// In-memory registry for the publish pipeline so the client can poll mid-flight progress. Single-
// server localhost demo — no DB, no migration, no cross-process sharing needed. Each job is keyed
// by an opaque random id, scoped to a single owner, and reaped after a short TTL once it terminates
// so the map doesn't grow unbounded. The pipeline's `onProgress` callback bumps `done` here; the
// terminal write stores the final `PublishState`.

import { randomUUID } from 'node:crypto';
import type { PublishState } from './publish';

/** A job lives in one of three states: still working, finished cleanly, or aborted. */
export type PublishJobStatus = 'running' | 'succeeded' | 'failed';

/** One settled variant from the parallel publish. `tagline` is null when the variant's copy
 *  failed validation — the client uses it only for the "Done!" tagline override in the row, and
 *  falls back to the existing prop in that case. */
export type CompletedVariant = { variant: string; tagline: string | null };

export type PublishJob = {
  id: string;
  ownerId: string;
  status: PublishJobStatus;
  /** Number of variants completed so far — bumped from `onProgress` in the publish pipeline. */
  done: number;
  /** Always 7 in the current product (one per visitor type). */
  total: number;
  /** Variants that have settled so far, in completion order. Surfaced through
   *  `pollPublishJobAction` so the client can flip per-row Regenerate buttons to "Done!" + blink
   *  green as each parallel call lands — even though all 7 calls were kicked off simultaneously. */
  completed: CompletedVariant[];
  /** The final pipeline state once `status !== 'running'`. */
  result?: PublishState;
  /** Created at, ms epoch. */
  startedAt: number;
  /** Set when the job reaches a terminal status. */
  finishedAt?: number;
};

const JOBS = new Map<string, PublishJob>();

/** How long a finished job lingers in memory before being reaped, in ms. */
const FINISHED_TTL_MS = 60_000;
/** How long a running job is allowed to stay before being assumed dead, in ms. */
const RUNNING_TTL_MS = 10 * 60_000;

function reapExpired(now: number): void {
  for (const [id, job] of JOBS) {
    const ttl = job.status === 'running' ? RUNNING_TTL_MS : FINISHED_TTL_MS;
    const startedOrFinished = job.finishedAt ?? job.startedAt;
    if (now - startedOrFinished > ttl) JOBS.delete(id);
  }
}

export function createPublishJob(ownerId: string, total: number): PublishJob {
  const now = Date.now();
  reapExpired(now);
  const job: PublishJob = {
    id: randomUUID(),
    ownerId,
    status: 'running',
    done: 0,
    total,
    completed: [],
    startedAt: now,
  };
  JOBS.set(job.id, job);
  return job;
}

/** Fetch a job by id, only if it belongs to the given owner. Returns `null` for unknown / foreign. */
export function getPublishJob(id: string, ownerId: string): PublishJob | null {
  const job = JOBS.get(id);
  if (!job || job.ownerId !== ownerId) return null;
  return job;
}

export function setPublishJobProgress(id: string, done: number): void {
  const job = JOBS.get(id);
  if (!job || job.status !== 'running') return;
  job.done = done;
}

/** Record one settled variant on the job — pushes onto `completed` (idempotent: a duplicate
 *  variant is ignored) and bumps `done`. The client diffs the returned `completed` list against
 *  its own seen-Set to drive per-row "Done!" + blink as each parallel call lands. */
export function appendCompletedVariant(
  id: string,
  variant: string,
  tagline: string | null,
): void {
  const job = JOBS.get(id);
  if (!job || job.status !== 'running') return;
  if (job.completed.some((c) => c.variant === variant)) return;
  job.completed.push({ variant, tagline });
  job.done = job.completed.length;
}

export function completePublishJob(id: string, result: PublishState): void {
  const job = JOBS.get(id);
  if (!job) return;
  job.status = result.ok ? 'succeeded' : 'failed';
  job.result = result;
  job.finishedAt = Date.now();
  if (result.ok) job.done = job.total;
}

/** Test helper: nuke the registry between cases. */
export function __resetPublishJobsForTests(): void {
  JOBS.clear();
}

import { createHash } from 'node:crypto';
import { Actor, log } from 'apify';

const STATE_KEY = 'OPEN_ATS_STATE';

interface SeenEntry {
  /** first time we saw this job, ISO */
  t: string;
  /** company key it belongs to, so expiry can be scoped correctly */
  c: string;
}

export interface RunState {
  lastRunAt: string | null;
  seen: Record<string, SeenEntry>;
  /** company key -> ETag or board content hash, used to skip unchanged boards */
  etags: Record<string, string>;
}

const EMPTY: RunState = { lastRunAt: null, seen: {}, etags: {} };

export const companyKey = (platform: string, slug: string) => `${platform}:${slug}`;

/** Jobs are identified by their canonical URL; it is the one field every ATS agrees on. */
export function jobHash(url: string): string {
  const canonical = url.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export function boardHash(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 32);
}

export async function loadState(): Promise<RunState> {
  const store = await Actor.openKeyValueStore();
  const raw = await store.getValue<RunState>(STATE_KEY);
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  return {
    lastRunAt: raw.lastRunAt ?? null,
    seen: raw.seen ?? {},
    etags: raw.etags ?? {},
  };
}

export async function saveState(state: RunState): Promise<void> {
  const store = await Actor.openKeyValueStore();
  await store.setValue(STATE_KEY, state);
  log.info(`State saved: ${Object.keys(state.seen).length} known jobs, ${Object.keys(state.etags).length} cached boards.`);
}

/**
 * Jobs that were present for a company last run and are gone now.
 *
 * Scoped to companies actually crawled this run, which matters: without that
 * guard, skipping a company (rate limit, transient 500, board unchanged) would
 * declare its entire board expired.
 */
export function computeExpired(
  state: RunState,
  crawledCompanies: ReadonlySet<string>,
  observedHashes: ReadonlySet<string>,
): Array<{ hash: string; company: string; firstSeen: string }> {
  const gone: Array<{ hash: string; company: string; firstSeen: string }> = [];
  for (const [hash, entry] of Object.entries(state.seen)) {
    if (!crawledCompanies.has(entry.c)) continue;
    if (observedHashes.has(hash)) continue;
    gone.push({ hash, company: entry.c, firstSeen: entry.t });
  }
  return gone;
}

export function pruneExpired(state: RunState, expiredHashes: ReadonlySet<string>): void {
  for (const h of expiredHashes) delete state.seen[h];
}

/** Drop entries older than the retention window so the state object cannot grow without bound. */
export function pruneOld(state: RunState, retentionDays: number, now = new Date()): number {
  const cutoff = now.getTime() - retentionDays * 864e5;
  let removed = 0;
  for (const [hash, entry] of Object.entries(state.seen)) {
    const t = Date.parse(entry.t);
    if (Number.isFinite(t) && t < cutoff) { delete state.seen[hash]; removed++; }
  }
  return removed;
}

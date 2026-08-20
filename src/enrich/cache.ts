import { createHash } from 'node:crypto';
import { Actor, log } from 'apify';

const CACHE_KEY = 'ENRICHMENT_CACHE';

export interface Enrichment {
  ai_key_skills: string[] | null;
  ai_core_responsibilities: string | null;
  ai_requirements_summary: string | null;
}

export type EnrichmentCache = Record<string, Enrichment>;

/** Descriptions are the billable unit, so the cache is keyed on the text itself. */
export function descriptionHash(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex').slice(0, 32);
}

export async function loadCache(storeName: string): Promise<EnrichmentCache> {
  // Named store, for the same reason as the run state: the default store is
  // recreated per run on the platform, so an unnamed cache silently re-pays
  // the model for every description on every run.
  const store = await Actor.openKeyValueStore(storeName);
  return (await store.getValue<EnrichmentCache>(CACHE_KEY)) ?? {};
}

export async function saveCache(cache: EnrichmentCache, storeName: string): Promise<void> {
  const store = await Actor.openKeyValueStore(storeName);
  await store.setValue(CACHE_KEY, cache);
  log.info(`Enrichment cache in "${storeName}": ${Object.keys(cache).length} descriptions stored.`);
}

/** Keep the cache from growing without bound across scheduled runs. */
export function trimCache(cache: EnrichmentCache, maxEntries: number): EnrichmentCache {
  const keys = Object.keys(cache);
  if (keys.length <= maxEntries) return cache;
  const keep = keys.slice(keys.length - maxEntries);
  const trimmed: EnrichmentCache = {};
  for (const k of keep) {
    const v = cache[k];
    if (v) trimmed[k] = v;
  }
  return trimmed;
}

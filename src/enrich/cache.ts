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

export async function loadCache(): Promise<EnrichmentCache> {
  const store = await Actor.openKeyValueStore();
  return (await store.getValue<EnrichmentCache>(CACHE_KEY)) ?? {};
}

export async function saveCache(cache: EnrichmentCache): Promise<void> {
  const store = await Actor.openKeyValueStore();
  await store.setValue(CACHE_KEY, cache);
  log.info(`Enrichment cache: ${Object.keys(cache).length} descriptions stored.`);
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

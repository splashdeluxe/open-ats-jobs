import { readFileSync } from 'node:fs';
import { Actor, log } from 'apify';
import { parseInput, type ActorInput } from './input.js';
import { CONNECTOR_BY_ID, CONNECTORS, detectBoard, type Connector, type FetchSpec, type ParseContext } from './connectors/index.js';
import type { PlatformId, RawJob } from './normalize/schema.js';
import { assembleJob, descriptionForEnrichment } from './normalize/index.js';
import { makeFilter, timeRangeToDate, type FilterConfig } from './filters.js';
import { Fetcher } from './fetcher.js';
import {
  boardHash, companyKey, computeExpired, jobHash,
  loadState, pruneExpired, pruneOld, saveState,
} from './state.js';
import { descriptionHash, loadCache, saveCache, trimCache, type Enrichment } from './enrich/cache.js';
import { enrichJobs } from './enrich/ai.js';

interface Target { platform: PlatformId; slug: string }

/** Accepts "greenhouse:gitlab" and "workday:nvidia:wd5:Site" (Workday slugs contain colons). */
function parseCompanyRef(ref: string): Target | null {
  const idx = ref.indexOf(':');
  if (idx === -1) return null;
  const platform = ref.slice(0, idx).trim() as PlatformId;
  const slug = ref.slice(idx + 1).trim();
  if (!slug || !CONNECTOR_BY_ID.has(platform)) return null;
  return { platform, slug };
}

interface SeedFile { boards: Record<string, Array<{ slug: string }>> }

/** The bundled list of boards verified against each platform's API. */
function loadSeedList(): string[] {
  try {
    const url = new URL('../seeds/companies.json', import.meta.url);
    const doc = JSON.parse(readFileSync(url, 'utf8')) as SeedFile;
    const refs = Object.entries(doc.boards ?? {})
      .flatMap(([platform, entries]) => entries.map((e) => `${platform}:${e.slug}`));
    log.info(`Seed list: ${refs.length} verified board(s) added.`);
    return refs;
  } catch (err) {
    log.warning(`Could not read the seed list: ${(err as Error).message}`);
    return [];
  }
}

function resolveTargets(input: ActorInput, enabled: Set<PlatformId>): Target[] {
  const seen = new Set<string>();
  const out: Target[] = [];
  const add = (t: Target | null) => {
    if (!t || !enabled.has(t.platform)) return;
    const key = companyKey(t.platform, t.slug);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  for (const ref of input.companies) add(parseCompanyRef(ref));
  for (const url of input.careerUrls) add(detectBoard(url));

  if (input.useSeedList) {
    for (const ref of loadSeedList()) add(parseCompanyRef(ref));
  }

  if (input.platforms.length) {
    const wanted = new Set(input.platforms);
    return out.filter((t) => wanted.has(t.platform));
  }
  return out;
}

/** Walk one company's board, following pagination up to the configured cap. */
async function crawlBoard(
  connector: Connector,
  target: Target,
  fetcher: Fetcher,
  ctx: ParseContext,
  priorEtag: string | null,
): Promise<{ jobs: RawJob[]; etag: string | null; unchanged: boolean }> {
  const specs = connector.listRequests(target.slug, ctx.opts);
  const jobs: RawJob[] = [];
  let etag: string | null = null;
  let pages = 0;

  let queue: FetchSpec[] = [...specs];
  let first = true;

  while (queue.length && pages < ctx.opts.maxPages) {
    const spec = queue.shift();
    if (!spec) break;

    // Only the first page carries the conditional header — a board that has not
    // changed lets us skip the entire download.
    const res = await fetcher.fetch(spec, first ? priorEtag : null);
    if (res.notModified) return { jobs: [], etag: priorEtag, unchanged: true };

    if (res.status >= 400) {
      log.warning(`${connector.label}/${target.slug}: HTTP ${res.status}`);
      break;
    }

    if (first) {
      // Fall back to hashing the body when the platform sends no ETag.
      etag = res.etag ?? boardHash(res.body);
      if (priorEtag && etag === priorEtag) return { jobs: [], etag, unchanged: true };
      first = false;
    }

    jobs.push(...connector.parseList(res.body, ctx));
    pages++;

    const next = connector.nextPage?.(res.body, spec, ctx);
    if (next) queue = [next];
  }

  return { jobs, etag, unchanged: false };
}

interface PendingJob { job: RawJob; connector: Connector; ctx: ParseContext }

/**
 * Fetch descriptions for a shortlist of jobs.
 *
 * Deliberately runs *after* deduplication, listing filters and the maxJobs cap.
 * Workday and Rippling charge one request per job here, so fetching before
 * filtering would mean hundreds of requests for data that is then discarded —
 * on a 700-job Rippling board that is the difference between 20 requests and 700.
 */
async function fetchDetails(pending: PendingJob[], fetcher: Fetcher): Promise<number> {
  const withDetail = pending.filter((p) => p.connector.detailRequest && p.connector.parseDetail);
  if (withDetail.length === 0) return 0;

  let fetched = 0;
  await Promise.all(withDetail.map(async ({ job, connector, ctx }) => {
    const spec = connector.detailRequest?.(job, ctx);
    if (!spec) return;
    try {
      const res = await fetcher.fetch(spec);
      if (res.status >= 400) return;
      Object.assign(job, connector.parseDetail?.(res.body, job) ?? {});
      fetched++;
    } catch (err) {
      log.debug(`Detail fetch failed for ${job.url}: ${(err as Error).message}`);
    }
  }));
  return fetched;
}

await Actor.init();

try {
  const input = parseInput(await Actor.getInput());

  const enabled = new Set<PlatformId>(
    CONNECTORS
      .filter((c) => !c.requiresOptIn || (c.id === 'smartrecruiters' && input.enableSmartRecruiters))
      .map((c) => c.id),
  );

  if (input.enableSmartRecruiters) {
    const sr = CONNECTOR_BY_ID.get('smartrecruiters');
    log.warning(`SmartRecruiters enabled by explicit opt-in. ${sr?.optInReason ?? ''}`);
  }

  const targets = resolveTargets(input, enabled);
  if (targets.length === 0) {
    throw new Error('No resolvable boards. Provide "companies" (e.g. "greenhouse:gitlab") or "careerUrls".');
  }
  log.info(`Crawling ${targets.length} board(s) across ${new Set(targets.map((t) => t.platform)).size} platform(s).`);

  const proxyConfiguration = input.proxyConfiguration
    ? await Actor.createProxyConfiguration(input.proxyConfiguration as Record<string, unknown>)
    : undefined;

  const fetcher = new Fetcher({
    concurrency: input.concurrency,
    proxyUrl: (await proxyConfiguration?.newUrl()) ?? null,
    hostDelays: Object.fromEntries(
      CONNECTORS.filter((c) => c.crawlDelayMs).map((c) => [c.host, c.crawlDelayMs as number]),
    ),
    maxRetries: input.maxRetries,
  });

  const state = await loadState(input.stateStoreName, input.resetState);
  const now = new Date();
  const runIso = now.toISOString();

  const filterCfg: FilterConfig = {
    ...input,
    datePostedAfter: input.datePostedAfter ?? timeRangeToDate(input.timeRange, now) ?? undefined,
  };
  const passesFilter = makeFilter(filterCfg);
  const passesListingFilter = makeFilter(filterCfg, { listingOnly: true });

  const crawledCompanies = new Set<string>();
  const observedHashes = new Set<string>();
  const freshJobs: PendingJob[] = [];
  const pendingHashes = new Set<string>();
  let skippedUnchanged = 0;
  let alreadySeen = 0;

  for (const target of targets) {
    const connector = CONNECTOR_BY_ID.get(target.platform);
    if (!connector) continue;

    const key = companyKey(target.platform, target.slug);
    const ctx: ParseContext = {
      slug: target.slug,
      organization: null,
      opts: { includeDescription: input.includeDescription, maxPages: input.maxPagesPerBoard },
      now,
    };

    try {
      const { jobs, etag, unchanged } = await crawlBoard(connector, target, fetcher, ctx, state.etags[key] ?? null);
      crawledCompanies.add(key);

      if (unchanged) {
        skippedUnchanged++;
        // The board is byte-identical, so everything we knew about it is still live.
        for (const [hash, entry] of Object.entries(state.seen)) {
          if (entry.c === key) observedHashes.add(hash);
        }
        continue;
      }
      if (etag) state.etags[key] = etag;

      let newHere = 0;
      for (const job of jobs) {
        if (!job.url || !job.title) continue;
        const hash = jobHash(job.url);
        observedHashes.add(hash);
        if (state.seen[hash]) { alreadySeen++; continue; }
        // Belt and braces: a connector emitting the same URL twice must not
        // produce two dataset rows (Rippling lists one row per work location).
        if (pendingHashes.has(hash)) continue;
        pendingHashes.add(hash);
        freshJobs.push({ job, connector, ctx });
        newHere++;
      }
      log.info(`${connector.label}/${target.slug}: ${jobs.length} listed, ${newHere} new.`);
    } catch (err) {
      log.warning(`${connector.label}/${target.slug} failed: ${(err as Error).message}`);
    }
  }

  const assembleOpts = {
    descriptionType: input.descriptionType,
    includeContactInfo: input.includeContactInfo,
    firstSeen: runIso,
  };

  // Cheap pass first, on listing data alone, then cap. Only what survives here
  // is worth spending a description request on.
  const shortlist = freshJobs
    .filter((p) => passesListingFilter(assembleJob(p.job, null, assembleOpts)))
    .slice(0, input.maxJobs);

  if (input.includeDescription) {
    const fetched = await fetchDetails(shortlist, fetcher);
    if (fetched) log.info(`Fetched ${fetched} description(s) for the shortlist.`);
  }

  // Second pass, now that descriptions and everything derived from them exist.
  const candidates = shortlist.filter((p) => passesFilter(assembleJob(p.job, null, assembleOpts)));

  log.info(`${freshJobs.length} new job(s); ${shortlist.length} shortlisted; ${candidates.length} passed all filters. Skipped ${alreadySeen} already-seen, ${skippedUnchanged} unchanged board(s).`);

  let enrichments = new Map<string, Enrichment>();
  const cache = input.enrichWithAI ? await loadCache(input.stateStoreName) : {};

  if (input.enrichWithAI) {
    const apiKey = input.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      log.warning('enrichWithAI is on but no Anthropic API key was provided; emitting derived fields only.');
    } else {
      enrichments = await enrichJobs(
        candidates.map(({ job }) => ({ job, text: descriptionForEnrichment(job) })),
        cache,
        {
          apiKey,
          model: input.enrichmentModel,
          batchSize: input.enrichmentBatchSize,
          maxJobs: input.maxEnrichedJobs,
        },
      );
    }
  }

  const dataset = await Actor.openDataset();
  const batch = candidates.map(({ job }) => {
    const text = descriptionForEnrichment(job);
    const enrichment = text ? enrichments.get(descriptionHash(text)) ?? null : null;
    state.seen[jobHash(job.url)] = { t: runIso, c: companyKey(job.source, job.companySlug) };
    return assembleJob(job, enrichment, assembleOpts);
  });

  if (batch.length) {
    await dataset.pushData(batch);
    await Actor.charge({ eventName: 'job', count: batch.length });
  }

  if (input.emitExpiredJobs) {
    const expired = computeExpired(state, crawledCompanies, observedHashes);
    if (expired.length) {
      const expiredDataset = await Actor.openDataset('expired-jobs', { forceCloud: false });
      await expiredDataset.pushData(expired.map((e) => ({
        job_hash: e.hash, company: e.company, first_seen: e.firstSeen, detected_expired_at: runIso,
      })));
      pruneExpired(state, new Set(expired.map((e) => e.hash)));
      log.info(`${expired.length} job(s) disappeared from their board and were written to "expired-jobs".`);
    }
  }

  const pruned = pruneOld(state, input.stateRetentionDays, now);
  if (pruned) log.info(`Pruned ${pruned} state entries older than ${input.stateRetentionDays} days.`);

  state.lastRunAt = runIso;
  await saveState(state, input.stateStoreName);
  if (input.enrichWithAI) await saveCache(trimCache(cache, 50_000), input.stateStoreName);

  log.info(`Done. ${batch.length} job(s) pushed to the default dataset.`);
} catch (err) {
  log.error(`Run failed: ${(err as Error).message}`);
  throw err;
} finally {
  await Actor.exit();
}

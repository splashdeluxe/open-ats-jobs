import { log } from 'apify';
import { z } from 'zod';
import type { RawJob } from '../normalize/schema.js';
import { descriptionHash, type Enrichment, type EnrichmentCache } from './cache.js';
import { SYSTEM_PROMPT, RESULT_SCHEMA, buildBatchPrompt } from './prompts.js';

const EMPTY: Enrichment = {
  ai_key_skills: null,
  ai_core_responsibilities: null,
  ai_requirements_summary: null,
};

const resultSchema = z.object({
  results: z.array(z.object({
    index: z.number(),
    key_skills: z.array(z.string()),
    core_responsibilities: z.string(),
    requirements_summary: z.string(),
  })),
});

export interface EnrichOptions {
  apiKey: string;
  /** Haiku 4.5 by default: this is bulk extraction, and it is the cheapest model that does it well. */
  model: string;
  batchSize: number;
  maxJobs: number;
}

interface Pending { hash: string; title: string; text: string }

/**
 * Enrich the three fields that genuinely need reading comprehension.
 *
 * Everything else in the ai_* block comes from derive.ts for free, so this runs
 * on the smallest possible slice of work: new jobs only, cache misses only.
 * A failure here degrades a row to null fields rather than dropping it — losing
 * a job to a timed-out API call is the worst outcome a jobs feed can have.
 */
export async function enrichJobs(
  jobs: Array<{ job: RawJob; text: string }>,
  cache: EnrichmentCache,
  opts: EnrichOptions,
): Promise<Map<string, Enrichment>> {
  const out = new Map<string, Enrichment>();
  const pending: Pending[] = [];
  const seen = new Set<string>();

  for (const { job, text } of jobs) {
    if (!text || text.trim().length < 120) continue;
    const hash = descriptionHash(text);
    const cached = cache[hash];
    if (cached) { out.set(hash, cached); continue; }
    if (seen.has(hash)) continue;
    seen.add(hash);
    pending.push({ hash, title: job.title, text });
  }

  if (pending.length === 0) {
    log.info('Enrichment: every description was already cached; no API calls made.');
    return out;
  }

  const budget = pending.slice(0, opts.maxJobs);
  if (budget.length < pending.length) {
    log.warning(`Enrichment capped at ${opts.maxJobs} jobs; ${pending.length - budget.length} left unenriched this run.`);
  }

  // Loaded lazily so the Actor runs with no Anthropic dependency when enrichment is off.
  let Anthropic: typeof import('@anthropic-ai/sdk').default;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    log.warning('@anthropic-ai/sdk is not installed; skipping enrichment.');
    return out;
  }

  const client = new Anthropic({ apiKey: opts.apiKey });
  let calls = 0;

  for (let i = 0; i < budget.length; i += opts.batchSize) {
    const batch = budget.slice(i, i + opts.batchSize);
    const prompt = buildBatchPrompt(batch.map((b, idx) => ({ index: idx, title: b.title, text: b.text })));

    try {
      const response = await client.messages.create({
        model: opts.model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
        messages: [{ role: 'user', content: prompt }],
      });
      calls++;

      if (response.stop_reason === 'refusal') {
        log.warning('Enrichment batch refused by the model; emitting nulls for it.');
        continue;
      }

      const textBlock = response.content.find((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text');
      if (!textBlock) continue;

      const parsed = resultSchema.safeParse(JSON.parse(textBlock.text));
      if (!parsed.success) {
        log.warning(`Enrichment batch returned an unexpected shape: ${parsed.error.message.slice(0, 200)}`);
        continue;
      }

      for (const r of parsed.data.results) {
        const target = batch[r.index];
        if (!target) continue;
        const enrichment: Enrichment = {
          ai_key_skills: r.key_skills.length ? r.key_skills : null,
          ai_core_responsibilities: r.core_responsibilities || null,
          ai_requirements_summary: r.requirements_summary || null,
        };
        out.set(target.hash, enrichment);
        cache[target.hash] = enrichment;
      }
    } catch (err) {
      // Fail soft, always. The job still ships with derived fields intact.
      log.warning(`Enrichment batch failed: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  log.info(`Enrichment: ${calls} API call(s) for ${budget.length} new descriptions (${out.size} total resolved).`);
  return out;
}

export { EMPTY as EMPTY_ENRICHMENT };

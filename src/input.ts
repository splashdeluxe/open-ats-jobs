import { z } from 'zod';
import { PLATFORM_IDS, EMPLOYMENT_TYPES, WORK_ARRANGEMENTS, EXPERIENCE_LEVELS } from './normalize/schema.js';

const strArray = z.array(z.string()).optional().default([]);

export const inputSchema = z.object({
  /** "platform:slug" pairs, e.g. "greenhouse:gitlab" or "workday:nvidia:wd5:Site". */
  companies: strArray,
  /** Careers URLs; the platform and slug are detected from each one. */
  careerUrls: strArray,
  /** Restrict to these platforms after resolution. Empty means all enabled ones. */
  platforms: z.array(z.enum(PLATFORM_IDS)).optional().default([]),
  useSeedList: z.boolean().optional().default(false),

  timeRange: z.enum(['1h', '24h', '7d', '30d', 'all']).optional().default('7d'),
  maxJobs: z.number().int().min(1).max(50_000).optional().default(1000),
  maxPagesPerBoard: z.number().int().min(1).max(200).optional().default(20),

  includeDescription: z.boolean().optional().default(true),
  descriptionType: z.enum(['text', 'html', 'both']).optional().default('text'),
  /** Off by default: postings sometimes name a recruiter, which is personal data under GDPR. */
  includeContactInfo: z.boolean().optional().default(false),

  titleSearch: strArray,
  titleExclusionSearch: strArray,
  locationSearch: strArray,
  locationExclusionSearch: strArray,
  descriptionSearch: strArray,
  descriptionExclusionSearch: strArray,
  organizationSearch: strArray,
  organizationExclusionSearch: strArray,
  countries: strArray,
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).optional().default([]),
  workArrangements: z.array(z.enum(WORK_ARRANGEMENTS)).optional().default([]),
  experienceLevels: z.array(z.enum(EXPERIENCE_LEVELS)).optional().default([]),
  languages: strArray,
  hasSalary: z.boolean().optional(),
  visaSponsorship: z.boolean().optional(),
  datePostedAfter: z.string().optional(),

  /** Off by default. Deterministic ai_* fields populate regardless, at no cost. */
  enrichWithAI: z.boolean().optional().default(false),
  anthropicApiKey: z.string().optional(),
  enrichmentModel: z.string().optional().default('claude-haiku-4-5'),
  enrichmentBatchSize: z.number().int().min(1).max(50).optional().default(20),
  maxEnrichedJobs: z.number().int().min(0).max(20_000).optional().default(500),

  emitExpiredJobs: z.boolean().optional().default(true),
  stateRetentionDays: z.number().int().min(1).max(365).optional().default(90),

  /**
   * Named key-value store holding seen-job hashes, board ETags and the
   * enrichment cache. It has to be named: the run's default store is recreated
   * every run, so an unnamed store makes incremental delivery, expiry detection
   * and caching quietly do nothing on the platform.
   *
   * Give separate feeds separate names so they do not share a seen-list.
   */
  stateStoreName: z.string().min(1).max(63).optional().default('open-ats-jobs-state'),
  /** Ignore and clear stored state for this run: return everything matching, not just what is unseen. */
  resetState: z.boolean().optional().default(false),

  /**
   * SmartRecruiters' robots.txt disallows all crawlers except LinkedInBot.
   * Enabling it is an explicit decision, recorded in the run log.
   */
  enableSmartRecruiters: z.boolean().optional().default(false),

  concurrency: z.number().int().min(1).max(20).optional().default(5),
  maxRetries: z.number().int().min(0).max(5).optional().default(2),
  proxyConfiguration: z.unknown().optional(),
});

export type ActorInput = z.infer<typeof inputSchema>;

export function parseInput(raw: unknown): ActorInput {
  const parsed = inputSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid Actor input — ${issues}`);
  }
  return parsed.data;
}

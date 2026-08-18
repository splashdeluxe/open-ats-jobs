import type { NormalizedJob } from './normalize/schema.js';

/**
 * Term matching follows the convention the incumbent API uses, so filter configs
 * port across unchanged: a trailing ":*" means prefix match, anything else is a
 * whole-word match. Comparison is case-insensitive.
 */
function termMatches(term: string, haystack: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith(':*')) {
    const stem = t.slice(0, -2);
    return stem.length > 0 && new RegExp(`\\b${escapeRe(stem)}`, 'i').test(haystack);
  }
  return new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(haystack);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const anyMatch = (terms: string[] | undefined, haystack: string): boolean =>
  !terms?.length || terms.some((t) => termMatches(t, haystack));

const noneMatch = (terms: string[] | undefined, haystack: string): boolean =>
  !terms?.length || !terms.some((t) => termMatches(t, haystack));

export interface FilterConfig {
  titleSearch?: string[];
  titleExclusionSearch?: string[];
  locationSearch?: string[];
  locationExclusionSearch?: string[];
  descriptionSearch?: string[];
  descriptionExclusionSearch?: string[];
  organizationSearch?: string[];
  organizationExclusionSearch?: string[];
  employmentTypes?: string[];
  workArrangements?: string[];
  experienceLevels?: string[];
  languages?: string[];
  countries?: string[];
  hasSalary?: boolean;
  visaSponsorship?: boolean;
  datePostedAfter?: string;
}

export interface FilterOptions {
  /**
   * Skip every criterion that needs a description.
   *
   * Used for the cheap first pass over listing data, before descriptions are
   * fetched: platforms like Workday and Rippling charge a request per job for
   * the description, so anything discarded here is a request never made.
   */
  listingOnly?: boolean;
}

export function makeFilter(cfg: FilterConfig, opts: FilterOptions = {}): (job: NormalizedJob) => boolean {
  const after = cfg.datePostedAfter ? Date.parse(cfg.datePostedAfter) : null;
  const listingOnly = opts.listingOnly === true;

  return (job) => {
    const title = job.title ?? '';
    const locationText = [
      ...job.locations_raw,
      ...job.cities_derived,
      ...job.regions_derived,
      ...job.countries_derived,
    ].join(' | ');
    // Description search intentionally includes the title, matching the incumbent's behaviour.
    const descriptionText = `${title}\n${job.description_text ?? ''}`;

    if (!anyMatch(cfg.titleSearch, title)) return false;
    if (!noneMatch(cfg.titleExclusionSearch, title)) return false;
    if (!anyMatch(cfg.locationSearch, locationText)) return false;
    if (!noneMatch(cfg.locationExclusionSearch, locationText)) return false;
    if (!anyMatch(cfg.organizationSearch, job.organization ?? '')) return false;
    if (!noneMatch(cfg.organizationExclusionSearch, job.organization ?? '')) return false;

    if (cfg.countries?.length) {
      const wanted = cfg.countries.map((c) => c.toLowerCase());
      if (!job.countries_derived.some((c) => wanted.includes(c.toLowerCase()))) return false;
    }

    // Everything below reads the description, or a field derived from it, so the
    // listing pass has to let it through rather than judge it on missing data.
    if (!listingOnly) {
      if (!anyMatch(cfg.descriptionSearch, descriptionText)) return false;
      if (!noneMatch(cfg.descriptionExclusionSearch, descriptionText)) return false;

      if (cfg.employmentTypes?.length && (!job.ai_employment_type || !cfg.employmentTypes.includes(job.ai_employment_type))) return false;
      if (cfg.workArrangements?.length && (!job.ai_work_arrangement || !cfg.workArrangements.includes(job.ai_work_arrangement))) return false;
      if (cfg.experienceLevels?.length && (!job.ai_experience_level || !cfg.experienceLevels.includes(job.ai_experience_level))) return false;
      if (cfg.languages?.length && (!job.ai_job_language || !cfg.languages.includes(job.ai_job_language))) return false;

      if (cfg.hasSalary === true && job.ai_salary_min_value === null && job.ai_salary_max_value === null) return false;
      if (cfg.visaSponsorship === true && job.ai_visa_sponsorship !== true) return false;
    }

    if (after !== null && Number.isFinite(after)) {
      const posted = job.date_posted ? Date.parse(job.date_posted) : NaN;
      // Undated jobs are kept: dropping them would silently lose whole platforms
      // (Rippling's list endpoint has no dates at all).
      if (Number.isFinite(posted) && posted < after) return false;
    }
    return true;
  };
}

export function timeRangeToDate(range: string, now = new Date()): string | null {
  const map: Record<string, number> = { '1h': 36e5, '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };
  const ms = map[range];
  return ms ? new Date(now.getTime() - ms).toISOString() : null;
}

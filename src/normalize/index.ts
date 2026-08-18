import type { NormalizedJob, RawJob } from './schema.js';
import { deriveAll, stripHtml } from './derive.js';
import type { Enrichment } from '../enrich/cache.js';

export interface AssembleOptions {
  descriptionType: 'text' | 'html' | 'both';
  includeContactInfo: boolean;
  firstSeen: string;
}

const CONTACT_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g,                       // email addresses
  /\+?\d[\d\s().-]{7,}\d/g,                          // phone numbers
];

/** Strip recruiter contact details unless the operator explicitly asked to keep them. */
function redactContacts(text: string | null): string | null {
  if (!text) return text;
  let out = text;
  for (const re of CONTACT_PATTERNS) out = out.replace(re, '[redacted]');
  return out;
}

export function assembleJob(
  raw: RawJob,
  enrichment: Enrichment | null,
  opts: AssembleOptions,
): NormalizedJob {
  const d = deriveAll(raw);

  const wantText = opts.descriptionType === 'text' || opts.descriptionType === 'both';
  const wantHtml = opts.descriptionType === 'html' || opts.descriptionType === 'both';

  const text = opts.includeContactInfo ? d.description_text : redactContacts(d.description_text);
  const html = opts.includeContactInfo
    ? raw.descriptionHtml ?? null
    : redactContacts(raw.descriptionHtml ?? null);

  return {
    id: `${raw.source}:${raw.companySlug}:${raw.sourceId}`,
    title: raw.title,
    organization: raw.organization,
    url: raw.url,
    apply_url: raw.applyUrl ?? null,

    date_posted: raw.datePosted ?? null,
    date_created: raw.dateCreated ?? null,
    date_first_seen: opts.firstSeen,

    locations_raw: raw.locationsRaw,
    locations_derived: d.locations.locations_derived,
    cities_derived: d.locations.cities_derived,
    regions_derived: d.locations.regions_derived,
    countries_derived: d.locations.countries_derived,
    lats_derived: d.locations.lats_derived,
    lngs_derived: d.locations.lngs_derived,
    location_type: d.location_type,

    description_text: wantText ? text : null,
    description_html: wantHtml ? html : null,

    salary_raw: raw.salaryRaw ?? null,
    employment_type: raw.employmentTypeRaw ?? null,
    department: raw.departmentRaw ?? null,

    source: raw.source,
    source_domain: raw.sourceDomain,
    domain_derived: d.domain_derived,

    ai_salary_currency: d.ai_salary_currency,
    ai_salary_min_value: d.ai_salary_min_value,
    ai_salary_max_value: d.ai_salary_max_value,
    ai_salary_unit_text: d.ai_salary_unit_text,
    ai_employment_type: d.ai_employment_type,
    ai_work_arrangement: d.ai_work_arrangement,
    ai_work_arrangement_office_days: d.ai_work_arrangement_office_days,
    ai_experience_level: d.ai_experience_level,
    ai_visa_sponsorship: d.ai_visa_sponsorship,
    ai_job_language: d.ai_job_language,
    ai_taxonomies_a: d.ai_taxonomies_a,

    ai_key_skills: enrichment?.ai_key_skills ?? null,
    ai_core_responsibilities: enrichment?.ai_core_responsibilities ?? null,
    ai_requirements_summary: enrichment?.ai_requirements_summary ?? null,
  };
}

/** The text the enrichment step reads, independent of what we choose to emit. */
export function descriptionForEnrichment(raw: RawJob): string {
  return raw.descriptionText?.trim() ? raw.descriptionText : stripHtml(raw.descriptionHtml);
}

export * from './schema.js';

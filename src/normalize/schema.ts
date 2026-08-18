import { z } from 'zod';

/** Every platform the registry knows about. Wave 1 is verified live; waves 2/3 roll out behind it. */
export const PLATFORM_IDS = [
  // wave 1 - verified against live boards
  'greenhouse', 'lever', 'ashby', 'workday', 'workable',
  'rippling', 'personio', 'breezy', 'smartrecruiters',
  // wave 2 - documented public JSON
  'recruitee', 'join', 'bamboohr', 'jazzhr', 'teamtailor', 'comeet', 'gohire',
  'hirehive', 'pinpoint', 'recooty', 'manatal', 'freshteam', 'zoho', 'dover',
  'gem', 'homerun', 'jobylon', 'softgarden', 'dvinci', 'avature',
  // wave 3 - enterprise tier
  'icims', 'taleo', 'successfactors', 'oraclecloud', 'csod', 'phenompeople',
  'paycom', 'paylocity', 'ultipro', 'dayforce', 'adp', 'jobvite', 'eightfold',
  'pageup', 'paradox', 'trakstar', 'hireology', 'applicantpro', 'careerplug',
  'isolved', 'trinet', 'hibob', 'polymer', 'kula', 'rival', 'hiringthing',
  'hirebridge', 'firststage', 'werecruit', 'paycor',
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export const WORK_ARRANGEMENTS = ['On-site', 'Hybrid', 'Remote OK', 'Remote Solely'] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

export const EMPLOYMENT_TYPES = [
  'FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EXPERIENCE_LEVELS = ['0-2', '2-5', '5-10', '10+'] as const;

/**
 * What a connector hands back. Deliberately loose: connectors fetch and reshape,
 * they never interpret. All the guessing happens in derive.ts.
 */
export interface RawJob {
  sourceId: string;
  title: string;
  organization: string;
  url: string;
  applyUrl?: string | null;
  datePosted?: string | null;
  dateCreated?: string | null;
  locationsRaw: string[];
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  employmentTypeRaw?: string | null;
  departmentRaw?: string | null;
  /** Whatever the platform natively exposes about pay. Shape varies per ATS. */
  salaryRaw?: unknown;
  remoteFlag?: boolean | null;
  workplaceTypeRaw?: string | null;
  source: PlatformId;
  sourceDomain: string;
  companySlug: string;
  extra?: Record<string, unknown>;
}

export const derivedLocationSchema = z.object({
  city: z.string().nullable(),
  admin: z.string().nullable(),
  country: z.string().nullable(),
});
export type DerivedLocation = z.infer<typeof derivedLocationSchema>;

/**
 * Output contract. Field names intentionally mirror fantastic-jobs so an existing
 * consumer can repoint at this Actor without rewriting their pipeline.
 */
export const normalizedJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  organization: z.string(),
  url: z.string(),
  apply_url: z.string().nullable(),

  date_posted: z.string().nullable(),
  date_created: z.string().nullable(),
  date_first_seen: z.string(),

  locations_raw: z.array(z.string()),
  locations_derived: z.array(derivedLocationSchema),
  cities_derived: z.array(z.string()),
  regions_derived: z.array(z.string()),
  countries_derived: z.array(z.string()),
  lats_derived: z.array(z.number()),
  lngs_derived: z.array(z.number()),
  location_type: z.string().nullable(),

  description_text: z.string().nullable(),
  description_html: z.string().nullable(),

  salary_raw: z.unknown().nullable(),
  employment_type: z.string().nullable(),
  department: z.string().nullable(),

  source: z.enum(PLATFORM_IDS),
  source_domain: z.string(),
  domain_derived: z.string().nullable(),

  // --- derived for free by derive.ts, no model involved ---
  ai_salary_currency: z.string().nullable(),
  ai_salary_min_value: z.number().nullable(),
  ai_salary_max_value: z.number().nullable(),
  ai_salary_unit_text: z.string().nullable(),
  ai_employment_type: z.enum(EMPLOYMENT_TYPES).nullable(),
  ai_work_arrangement: z.enum(WORK_ARRANGEMENTS).nullable(),
  ai_work_arrangement_office_days: z.number().nullable(),
  ai_experience_level: z.enum(EXPERIENCE_LEVELS).nullable(),
  ai_visa_sponsorship: z.boolean().nullable(),
  ai_job_language: z.string().nullable(),
  ai_taxonomies_a: z.array(z.string()),

  // --- only populated when enrichWithAI is on ---
  ai_key_skills: z.array(z.string()).nullable(),
  ai_core_responsibilities: z.string().nullable(),
  ai_requirements_summary: z.string().nullable(),
});

export type NormalizedJob = z.infer<typeof normalizedJobSchema>;

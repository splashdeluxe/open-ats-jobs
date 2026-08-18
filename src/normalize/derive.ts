import type { EmploymentType, RawJob, WorkArrangement } from './schema.js';
import { extractSalary } from './salary.js';
import { buildLocationBundle } from './location.js';

/**
 * Everything in here runs on plain string and object inspection. No model, no API
 * key, no per-row cost. It exists because most of what people reach for an LLM to
 * extract is already sitting in the ATS payload or is a two-line regex away.
 */

const stripHtml = (html?: string | null): string =>
  (html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export { stripHtml };

export function normalizeEmploymentType(raw?: string | null): EmploymentType | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[_\s-]/g, '');
  if (/(fulltime|permanent|regular|unbefristet|vollzeit|cdi)/.test(s)) return 'FULL_TIME';
  if (/(parttime|teilzeit)/.test(s)) return 'PART_TIME';
  if (/(contract|contractor|freelance|b2b|consultant|cdd)/.test(s)) return 'CONTRACTOR';
  if (/(temp|temporary|seasonal|fixedterm|befristet)/.test(s)) return 'TEMPORARY';
  if (/(intern|internship|praktikum|werkstudent|apprentice|trainee|graduate|student)/.test(s)) return 'INTERN';
  if (/(volunteer|ehrenamt)/.test(s)) return 'VOLUNTEER';
  if (/(perdiem|casual)/.test(s)) return 'PER_DIEM';
  return 'OTHER';
}

export interface ArrangementResult {
  arrangement: WorkArrangement | null;
  officeDays: number | null;
  locationType: string | null;
}

export function deriveWorkArrangement(
  job: RawJob,
  text: string,
  hasPhysicalLocation: boolean,
  locationsSayRemote: boolean,
): ArrangementResult {
  const wp = (job.workplaceTypeRaw ?? '').toLowerCase();
  const haystack = `${job.title}\n${job.locationsRaw.join(' ')}\n${text.slice(0, 4000)}`.toLowerCase();

  const officeDays = (() => {
    const m = haystack.match(/(\d)\s*(?:\+)?\s*days?\s*(?:per|a|\/)?\s*week[^.]{0,25}(?:office|on-?site|onsite)/)
      ?? haystack.match(/(?:office|on-?site|onsite)[^.]{0,25}(\d)\s*days?\s*(?:per|a|\/)?\s*week/);
    const n = m?.[1] ? Number(m[1]) : null;
    return n !== null && n >= 1 && n <= 5 ? n : null;
  })();

  const saysHybrid = wp.includes('hybrid') || /\bhybrid\b/.test(haystack) || officeDays !== null;
  const saysRemote = wp.includes('remote') || job.remoteFlag === true || locationsSayRemote
    || /\b(fully remote|remote[- ]first|100% remote|work from anywhere)\b/.test(haystack);
  const saysOnsite = wp.includes('onsite') || wp.includes('on_site') || wp.includes('on-site');

  if (saysHybrid) {
    return { arrangement: 'Hybrid', officeDays, locationType: null };
  }
  if (saysRemote) {
    // "Remote OK" means remote with an office still available; "Remote Solely" means no office at all.
    const solely = !hasPhysicalLocation || /\b(fully remote|100% remote|remote[- ]only|work from anywhere|no office)\b/.test(haystack);
    return { arrangement: solely ? 'Remote Solely' : 'Remote OK', officeDays: null, locationType: 'TELECOMMUTE' };
  }
  if (saysOnsite || hasPhysicalLocation) {
    return { arrangement: 'On-site', officeDays: null, locationType: null };
  }
  return { arrangement: null, officeDays: null, locationType: null };
}

export function deriveExperienceLevel(title: string, text: string): '0-2' | '2-5' | '5-10' | '10+' | null {
  const t = title.toLowerCase();

  if (/\b(intern|internship|working student|werkstudent|praktikant|graduate|apprentice|entry[- ]level|junior|jr\.?)\b/.test(t)) return '0-2';
  if (/\b(vp|vice president|chief|head of|director|principal|distinguished|fellow)\b/.test(t)) return '10+';
  if (/\b(staff|senior staff|lead|manager|sr\.? manager)\b/.test(t)) return '5-10';
  if (/\b(senior|sr\.?)\b/.test(t)) return '5-10';

  // Fall back to an explicit years-of-experience statement in the body.
  const body = text.slice(0, 8000).toLowerCase();
  const m = body.match(/(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(\d{1,2})?\s*years?[^.]{0,40}experience/);
  if (m?.[1]) {
    const lower = Number(m[1]);
    if (lower >= 10) return '10+';
    if (lower >= 5) return '5-10';
    if (lower >= 2) return '2-5';
    return '0-2';
  }
  return null;
}

/** Stopword frequency. Crude, but reliable enough to tag a description's language. */
const LANG_MARKERS: Array<[string, string[]]> = [
  ['English', ['the', 'and', 'you', 'with', 'for', 'our', 'we', 'will', 'your']],
  ['German', ['und', 'der', 'die', 'das', 'mit', 'für', 'wir', 'du', 'sie', 'eine']],
  ['French', ['et', 'les', 'des', 'vous', 'pour', 'nous', 'une', 'dans', 'avec']],
  ['Spanish', ['de', 'que', 'los', 'las', 'para', 'con', 'una', 'nuestro', 'tu']],
  ['Italian', ['di', 'che', 'per', 'con', 'una', 'nostro', 'della', 'sono']],
  ['Dutch', ['de', 'het', 'een', 'van', 'en', 'voor', 'met', 'je', 'wij']],
  ['Portuguese', ['de', 'que', 'para', 'com', 'uma', 'nosso', 'você', 'não']],
  ['Polish', ['i', 'w', 'na', 'z', 'do', 'nasze', 'oraz', 'jest']],
  ['Swedish', ['och', 'att', 'för', 'med', 'som', 'vi', 'du', 'är']],
  ['Danish', ['og', 'at', 'for', 'med', 'som', 'vi', 'du', 'er']],
  ['Norwegian', ['og', 'å', 'for', 'med', 'som', 'vi', 'du', 'er']],
  ['Finnish', ['ja', 'on', 'sekä', 'että', 'me', 'sinä', 'työ']],
  ['Czech', ['a', 'na', 'se', 'pro', 'je', 'nebo', 'naše']],
  ['Romanian', ['și', 'de', 'pentru', 'cu', 'este', 'nostru']],
  ['Turkish', ['ve', 'ile', 'için', 'bir', 'bu', 'olarak']],
];

export function detectLanguage(text: string): string | null {
  const sample = text.slice(0, 4000).toLowerCase();
  if (sample.trim().length < 40) return null;
  const words = sample.split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 20) return null;

  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);

  let best: string | null = null;
  let bestScore = 0;
  for (const [lang, markers] of LANG_MARKERS) {
    const score = markers.reduce((sum, m) => sum + (counts.get(m) ?? 0), 0) / words.length;
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  return bestScore >= 0.015 ? best : null;
}

export function deriveVisaSponsorship(text: string): boolean | null {
  const s = text.slice(0, 12000).toLowerCase();
  if (/\b(no visa sponsorship|not (?:able|be able) to sponsor|unable to sponsor|cannot sponsor|do(?:es)? not (?:offer|provide) (?:visa )?sponsorship|without sponsorship)\b/.test(s)) return false;
  if (/\b(visa sponsorship (?:is )?(?:available|offered|provided)|we sponsor|sponsorship (?:is )?available|will sponsor|relocation (?:and|&) visa|work permit support)\b/.test(s)) return true;
  return null;
}

/** Same 33 categories the competitor exposes, so the field stays drop-in compatible. */
const TAXONOMY_RULES: Array<[string, RegExp]> = [
  ['Software', /\b(software|developer|engineer(?:ing)? (?:manager|lead)?|backend|frontend|full[- ]?stack|devops|sre|platform|mobile|ios|android|qa|sdet)\b/],
  ['Technology', /\b(it|technology|technical|cloud|infrastructure|systems?|network|architect)\b/],
  ['Data & Analytics', /\b(data (?:scientist|analyst|engineer)|analytics|machine learning|ml |ai |bi |business intelligence)\b/],
  ['Sales', /\b(sales|account executive|business development|bdr|sdr|revenue|partnerships)\b/],
  ['Marketing', /\b(marketing|growth|seo|sem|content|brand|communications|pr |demand gen)\b/],
  ['Finance & Accounting', /\b(finance|financial|accounting|accountant|controller|treasury|audit|fp&a|tax)\b/],
  ['Human Resources', /\b(human resources|hr |people|recruit|talent|compensation|benefits)\b/],
  ['Customer Service & Support', /\b(customer (?:service|support|success)|support (?:agent|specialist)|help ?desk)\b/],
  ['Legal', /\b(legal|counsel|attorney|paralegal|compliance officer)\b/],
  ['Engineering', /\b(mechanical|electrical|civil|chemical|aerospace|hardware) engineer/],
  ['Healthcare', /\b(nurse|physician|clinical|medical|healthcare|patient|pharmac)\b/],
  ['Science & Research', /\b(research|scientist|laboratory|r&d|biolog|chemist)\b/],
  ['Management & Leadership', /\b(chief|ceo|cto|cfo|coo|vp |vice president|head of|director|general manager)\b/],
  ['Design', /\b(designer|design|ux|ui |user experience|graphic|creative director)\b/],
  ['Operations', /\b(operations|ops |supply chain|procurement|warehouse|fulfilment|fulfillment)\b/],
  ['Logistics', /\b(logistics|shipping|freight|transport|driver|courier|dispatch)\b/],
  ['Manufacturing', /\b(manufacturing|production|assembly|machinist|fabrication)\b/],
  ['Construction', /\b(construction|site manager|foreman|surveyor|builder)\b/],
  ['Education', /\b(teacher|professor|lecturer|tutor|education|academic|curriculum)\b/],
  ['Hospitality', /\b(hotel|hospitality|chef|restaurant|barista|waiter|housekeep)\b/],
  ['Retail', /\b(retail|store|merchandis|cashier|shop assistant)\b/],
  ['Security & Safety', /\b(security|cyber ?security|infosec|safety|guard|soc analyst)\b/],
  ['Consulting', /\b(consultant|consulting|advisory|strategy)\b/],
  ['Government & Public Sector', /\b(government|public sector|policy|municipal|federal)\b/],
  ['Energy', /\b(energy|solar|wind|oil|gas|utilities|renewable)\b/],
  ['Administrative', /\b(administrative|assistant|office manager|receptionist|coordinator)\b/],
];

/**
 * Categorise a role, weighting the title and department far above the body text.
 *
 * Matching the whole description is what a first pass does, and it is wrong: a
 * fintech's boilerplate mentions finance, sales and marketing in every posting,
 * so a security engineer at Ramp came back tagged Sales and Marketing. The title
 * and department are what actually describe the job, so they decide the result;
 * the body is only consulted when they yield nothing, and then only sparingly.
 */
export function deriveTaxonomies(title: string, department: string | null, text: string): string[] {
  const strong = `${title} ${department ?? ''}`.toLowerCase();
  const hits: string[] = [];

  for (const [label, re] of TAXONOMY_RULES) {
    if (re.test(strong)) hits.push(label);
    if (hits.length >= 5) return hits;
  }
  if (hits.length > 0) return hits;

  // Nothing in the title or department matched, so fall back to the opening of
  // the description — capped at two, because this signal is much weaker.
  const weak = text.slice(0, 1200).toLowerCase();
  for (const [label, re] of TAXONOMY_RULES) {
    if (re.test(weak)) hits.push(label);
    if (hits.length >= 2) break;
  }
  return hits;
}

const ATS_HOSTS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'workable.com',
  'rippling.com', 'personio.de', 'personio.com', 'breezy.hr', 'smartrecruiters.com',
  'recruitee.com', 'join.com', 'bamboohr.com', 'applytojob.com', 'teamtailor.com',
  'comeet.com', 'gohire.io', 'hirehive.com', 'pinpointhq.com', 'jobvite.com',
  'icims.com', 'taleo.net', 'successfactors.com', 'oraclecloud.com', 'avature.net',
  'softgarden.io', 'dvinci.de', 'homerun.co', 'jobylon.com', 'zohorecruit.com',
];

/** The employer's own domain, when the posting URL actually points at it rather than the ATS. */
export function deriveDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (ATS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
    return host;
  } catch {
    return null;
  }
}

export interface DerivedFields {
  description_text: string | null;
  ai_salary_currency: string | null;
  ai_salary_min_value: number | null;
  ai_salary_max_value: number | null;
  ai_salary_unit_text: string | null;
  ai_employment_type: EmploymentType | null;
  ai_work_arrangement: WorkArrangement | null;
  ai_work_arrangement_office_days: number | null;
  ai_experience_level: '0-2' | '2-5' | '5-10' | '10+' | null;
  ai_visa_sponsorship: boolean | null;
  ai_job_language: string | null;
  ai_taxonomies_a: string[];
  location_type: string | null;
  locations: ReturnType<typeof buildLocationBundle>;
  domain_derived: string | null;
}

export function deriveAll(job: RawJob): DerivedFields {
  const text = job.descriptionText?.trim()
    ? job.descriptionText
    : stripHtml(job.descriptionHtml);

  const locations = buildLocationBundle(job.locationsRaw);
  const hasPhysicalLocation = locations.cities_derived.length > 0 || locations.regions_derived.length > 0;

  const arrangement = deriveWorkArrangement(job, text, hasPhysicalLocation, locations.anyRemote);
  const salary = extractSalary(job.salaryRaw, text);

  return {
    description_text: text || null,
    ai_salary_currency: salary.currency,
    ai_salary_min_value: salary.min,
    ai_salary_max_value: salary.max,
    ai_salary_unit_text: salary.unitText,
    ai_employment_type: normalizeEmploymentType(job.employmentTypeRaw) ?? normalizeEmploymentType(job.title),
    ai_work_arrangement: arrangement.arrangement,
    ai_work_arrangement_office_days: arrangement.officeDays,
    ai_experience_level: deriveExperienceLevel(job.title, text),
    ai_visa_sponsorship: deriveVisaSponsorship(text),
    ai_job_language: detectLanguage(text),
    ai_taxonomies_a: deriveTaxonomies(job.title, job.departmentRaw ?? null, text),
    location_type: arrangement.locationType,
    locations,
    domain_derived: deriveDomain(job.url),
  };
}

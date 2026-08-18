import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONNECTOR_BY_ID } from '../src/connectors/index.js';
import { deriveAll, deriveTaxonomies } from '../src/normalize/derive.js';
import { parseLocationString } from '../src/normalize/location.js';
import { parseMoney, extractSalary } from '../src/normalize/salary.js';
import { parseRelativeDate } from '../src/normalize/dates.js';
import type { PlatformId, RawJob } from '../src/normalize/schema.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const ctx = (slug: string) => ({
  slug, organization: null,
  opts: { includeDescription: true, maxPages: 5 },
  now: new Date('2026-08-18T12:00:00Z'),
});

const CASES: Array<[PlatformId, string, string]> = [
  ['greenhouse', 'greenhouse.raw.json', 'gitlab'],
  ['lever', 'lever.raw.json', 'matchgroup'],
  ['ashby', 'ashby.raw.json', 'ramp'],
  ['workday', 'workday.raw.json', 'nvidia:wd5:NVIDIAExternalCareerSite'],
  ['workable', 'workable.raw.json', 'viva'],
  ['rippling', 'rippling.raw.json', 'rippling'],
  ['personio', 'personio.raw.xml', 'urbansportsclub'],
  ['breezy', 'breezy.raw.json', 'breezy'],
  ['smartrecruiters', 'smartrecruiters.raw.json', 'Visa'],
];

const allJobs = (): RawJob[] =>
  CASES.flatMap(([id, fx, slug]) =>
    CONNECTOR_BY_ID.get(id)!.parseList(readFileSync(join(FIXTURES, fx), 'utf8'), ctx(slug)));

describe('money parsing', () => {
  it.each([
    ['150,000', 150_000], ['211.4K', 211_400], ['60.000', 60_000],
    ['1.2M', 1_200_000], ['0.05', 0.05], ['80k', 80_000], ['1.234,56', 1234.56],
  ])('parses %s', (input, expected) => {
    expect(parseMoney(input)).toBeCloseTo(expected, 1);
  });
});

describe('salary extraction', () => {
  it('reads a Lever salaryRange object', () => {
    expect(extractSalary({ interval: 'per-year-salary', currency: 'USD', min: 150000, max: 180000 }))
      .toEqual({ currency: 'USD', min: 150000, max: 180000, unitText: 'YEAR' });
  });

  it('picks base salary out of an Ashby tier, ignoring the equity component', () => {
    const ashbyLike = {
      compensationTiers: [{ components: [
        { compensationType: 'EquityPercentage', interval: 'NONE', currencyCode: null, minValue: null, maxValue: null },
        { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 211400, maxValue: 290600 },
      ] }],
    };
    const r = extractSalary(ashbyLike);
    expect(r).toMatchObject({ currency: 'USD', min: 211400, max: 290600, unitText: 'YEAR' });
  });

  it('reads a Breezy salary string including its cadence', () => {
    const r = extractSalary('$0.05 – $0.06 / hour');
    expect(r.currency).toBe('USD');
    expect(r.unitText).toBe('HOUR');
  });

  it('falls back to prose in a description', () => {
    const r = extractSalary(null, 'We offer €60.000 - €80.000 per year plus equity.');
    expect(r).toMatchObject({ currency: 'EUR', min: 60_000, max: 80_000, unitText: 'YEAR' });
  });
});

describe('location parsing', () => {
  it('handles city-first and country-first ordering identically', () => {
    const a = parseLocationString('Bengaluru, India');
    const b = parseLocationString('India, Bengaluru');
    expect(a.loc.country).toBe('India');
    expect(b.loc.country).toBe('India');
  });

  it('resolves a US state abbreviation and geocodes it', () => {
    const r = parseLocationString('Austin, TX, United States');
    expect(r.loc).toEqual({ city: 'Austin', admin: 'Texas', country: 'United States' });
    expect(r.lat).toBeCloseTo(30.27, 1);
  });

  it('flags remote and still keeps the country', () => {
    const r = parseLocationString('Remote, Italy');
    expect(r.remote).toBe(true);
    expect(r.loc.country).toBe('Italy');
  });

  it('does not geocode a city into the wrong country', () => {
    const r = parseLocationString('Berlin, Maryland, United States');
    expect(r.loc.country).toBe('United States');
    expect(r.lat).toBeNull();
  });

  it('maps UK constituent countries onto the United Kingdom', () => {
    expect(parseLocationString('London, England').loc.country).toBe('United Kingdom');
  });
});

describe('workday relative dates', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  it('resolves "Posted Today"', () => {
    expect(parseRelativeDate('Posted Today', now)).toBe('2026-08-18T00:00:00.000Z');
  });
  it('resolves "Posted 3 Days Ago"', () => {
    expect(parseRelativeDate('Posted 3 Days Ago', now)).toBe('2026-08-15T00:00:00.000Z');
  });
  it('resolves "Posted 30+ Days Ago"', () => {
    expect(parseRelativeDate('Posted 30+ Days Ago', now)).toBe('2026-07-19T00:00:00.000Z');
  });
});

describe('extraction coverage across all fixtures', () => {
  const jobs = allJobs();
  const derived = jobs.map(deriveAll);
  const rate = (f: (d: typeof derived[number]) => boolean) =>
    derived.filter(f).length / derived.length;

  it('resolves a country for most jobs', () => {
    const r = rate((d) => d.locations.countries_derived.length > 0);
    // eslint-disable-next-line no-console
    console.log(`  country resolved : ${(r * 100).toFixed(0)}%`);
    expect(r).toBeGreaterThan(0.6);
  });

  it('classifies employment type for most jobs', () => {
    const r = rate((d) => d.ai_employment_type !== null);
    console.log(`  employment type  : ${(r * 100).toFixed(0)}%`);
    expect(r).toBeGreaterThan(0.5);
  });

  it('assigns at least one taxonomy to most jobs', () => {
    const r = rate((d) => d.ai_taxonomies_a.length > 0);
    console.log(`  taxonomy         : ${(r * 100).toFixed(0)}%`);
    expect(r).toBeGreaterThan(0.7);
  });

  it('reports geocode, salary, language and arrangement coverage', () => {
    console.log(`  geocoded         : ${(rate((d) => d.locations.lats_derived.length > 0) * 100).toFixed(0)}%`);
    console.log(`  salary           : ${(rate((d) => d.ai_salary_min_value !== null) * 100).toFixed(0)}%`);
    console.log(`  language         : ${(rate((d) => d.ai_job_language !== null) * 100).toFixed(0)}%`);
    console.log(`  work arrangement : ${(rate((d) => d.ai_work_arrangement !== null) * 100).toFixed(0)}%`);
    console.log(`  total jobs       : ${derived.length}`);
    expect(derived.length).toBeGreaterThan(80);
  });
});

describe('taxonomy precision', () => {
  it('does not inherit a fintech employer\'s boilerplate into an engineering role', () => {
    const body = 'Ramp is the finance automation platform. Our sales and marketing teams '
      + 'help finance leaders. You will secure our cloud infrastructure.'.repeat(4);
    const tax = deriveTaxonomies('Security Engineer, Cloud', 'Engineering', body);
    expect(tax).toContain('Security & Safety');
    expect(tax).not.toContain('Sales');
    expect(tax).not.toContain('Marketing');
    expect(tax).not.toContain('Finance & Accounting');
  });

  it('classifies a genuine sales role as sales', () => {
    expect(deriveTaxonomies('Account Executive', 'Sales', '')).toContain('Sales');
  });

  it('falls back to the description when title and department say nothing', () => {
    const tax = deriveTaxonomies('Associate', null, 'You will be a registered nurse on our clinical ward.');
    expect(tax).toContain('Healthcare');
    expect(tax.length).toBeLessThanOrEqual(2);
  });
});

describe('location whitespace', () => {
  it('collapses whitespace left by stripped remote markers', () => {
    const r = parseLocationString('Remote - NY  HQ');
    expect(r.loc.city).not.toMatch(/\s{2,}/);
  });
});

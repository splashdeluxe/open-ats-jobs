import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONNECTOR_BY_ID, detectBoard } from '../src/connectors/index.js';
import type { ParseContext } from '../src/connectors/types.js';
import type { PlatformId, RawJob } from '../src/normalize/schema.js';
import { deriveAll } from '../src/normalize/derive.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const load = (f: string) => readFileSync(join(FIXTURES, f), 'utf8');

const ctx = (slug: string): ParseContext => ({
  slug,
  organization: null,
  opts: { includeDescription: true, maxPages: 5 },
  now: new Date('2026-08-18T12:00:00Z'),
});

const CASES: Array<{ id: PlatformId; fixture: string; slug: string; minJobs: number }> = [
  { id: 'greenhouse',      fixture: 'greenhouse.raw.json',      slug: 'gitlab',   minJobs: 10 },
  { id: 'lever',           fixture: 'lever.raw.json',           slug: 'matchgroup', minJobs: 10 },
  { id: 'ashby',           fixture: 'ashby.raw.json',           slug: 'ramp',     minJobs: 10 },
  { id: 'workday',         fixture: 'workday.raw.json',         slug: 'nvidia:wd5:NVIDIAExternalCareerSite', minJobs: 10 },
  { id: 'workable',        fixture: 'workable.raw.json',        slug: 'viva',     minJobs: 10 },
  // 12 fixture rows, but Rippling lists one row per work location, so 6 distinct jobs.
  { id: 'rippling',        fixture: 'rippling.raw.json',        slug: 'rippling', minJobs: 6 },
  { id: 'personio',        fixture: 'personio.raw.xml',         slug: 'urbansportsclub', minJobs: 10 },
  { id: 'breezy',          fixture: 'breezy.raw.json',          slug: 'breezy',   minJobs: 3 },
  { id: 'smartrecruiters', fixture: 'smartrecruiters.raw.json', slug: 'Visa',     minJobs: 2 },
  { id: 'recruitee',       fixture: 'recruitee.raw.json',       slug: 'nmbrs',    minJobs: 3 },
];

describe.each(CASES)('connector: $id', ({ id, fixture, slug, minJobs }) => {
  const connector = CONNECTOR_BY_ID.get(id)!;
  const jobs: RawJob[] = connector.parseList(load(fixture), ctx(slug));

  it('parses the expected number of jobs', () => {
    expect(jobs.length).toBeGreaterThanOrEqual(minJobs);
  });

  it('produces a usable RawJob for every row', () => {
    for (const j of jobs) {
      expect(j.title, `${id}: empty title`).toBeTruthy();
      expect(j.sourceId, `${id}: empty sourceId`).toBeTruthy();
      expect(j.url, `${id}: empty url`).toBeTruthy();
      expect(() => new URL(j.url), `${id}: bad url ${j.url}`).not.toThrow();
      expect(j.source).toBe(id);
      expect(Array.isArray(j.locationsRaw)).toBe(true);
    }
  });

  it('survives the derive pass', () => {
    for (const j of jobs) {
      const d = deriveAll(j);
      expect(Array.isArray(d.ai_taxonomies_a)).toBe(true);
      expect(d.locations.lats_derived.length).toBe(d.locations.lngs_derived.length);
    }
  });
});

describe('board detection', () => {
  it.each([
    ['https://boards.greenhouse.io/gitlab', 'greenhouse', 'gitlab'],
    ['https://job-boards.greenhouse.io/stripe/jobs/123', 'greenhouse', 'stripe'],
    ['https://jobs.lever.co/matchgroup', 'lever', 'matchgroup'],
    ['https://jobs.ashbyhq.com/ramp', 'ashby', 'ramp'],
    ['https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite', 'workday', 'nvidia:wd5:NVIDIAExternalCareerSite'],
    ['https://apply.workable.com/viva/', 'workable', 'viva'],
    ['https://urbansportsclub.jobs.personio.de/', 'personio', 'urbansportsclub'],
    ['https://breezy.breezy.hr/', 'breezy', 'breezy'],
  ])('resolves %s', (url, platform, slug) => {
    expect(detectBoard(url)).toEqual({ platform, slug });
  });

  it('returns null for a non-ATS url', () => {
    expect(detectBoard('https://example.com/careers')).toBeNull();
  });
});

describe('rippling multi-location rows', () => {
  const connector = CONNECTOR_BY_ID.get('rippling')!;
  const jobs = connector.parseList(load('rippling.raw.json'), ctx('rippling'));

  it('collapses one-row-per-location into a single job', () => {
    // The fixture holds 12 rows covering 6 distinct uuids.
    expect(jobs.length).toBe(6);
  });

  it('keeps every location on the merged job', () => {
    const multi = jobs.find((j) => j.sourceId === '2f0674e6-f01f-4ecd-b459-e947241c211f');
    expect(multi?.locationsRaw).toHaveLength(4);
    expect(multi?.locationsRaw).toContain('New York, NY');
  });

  it('never emits the same url twice', () => {
    const urls = jobs.map((j) => j.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

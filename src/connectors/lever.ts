import type { Connector } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

interface LeverJob {
  id: string; text: string; hostedUrl: string; applyUrl?: string;
  createdAt?: number; descriptionPlain?: string; description?: string;
  additionalPlain?: string; additional?: string; country?: string; workplaceType?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string; department?: string };
}

export const lever: Connector = {
  id: 'lever',
  label: 'Lever',
  host: 'api.lever.co',
  crawlDelayMs: 1000, // api.lever.co/robots.txt publishes Crawl-delay: 1

  listRequests(slug) {
    return [{ url: `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json` }];
  },

  parseList(body, ctx) {
    const jobs = safeJson<LeverJob[]>(body);
    return asArray<LeverJob>(jobs).map((j): RawJob => ({
      sourceId: j.id,
      title: j.text ?? '',
      organization: ctx.organization ?? ctx.slug,
      url: j.hostedUrl,
      applyUrl: str(j.applyUrl) ?? j.hostedUrl,
      datePosted: toIso(j.createdAt, ctx.now),
      dateCreated: toIso(j.createdAt, ctx.now),
      locationsRaw: cleanLocations([
        j.categories?.location,
        ...asArray<string>(j.categories?.allLocations),
        j.country,
      ]),
      descriptionHtml: [j.description, j.additional].filter(Boolean).join('\n') || null,
      descriptionText: [j.descriptionPlain, j.additionalPlain].filter(Boolean).join('\n') || null,
      employmentTypeRaw: str(j.categories?.commitment),
      departmentRaw: str(j.categories?.department) ?? str(j.categories?.team),
      salaryRaw: j.salaryRange ?? null,
      remoteFlag: /remote/i.test(j.workplaceType ?? '') || null,
      workplaceTypeRaw: str(j.workplaceType),
      source: 'lever',
      sourceDomain: 'lever.co',
      companySlug: ctx.slug,
    }));
  },

  detect(url) {
    if (!/(^|\.)lever\.co$/.test(url.hostname)) return null;
    const seg = url.pathname.split('/').filter(Boolean);
    return seg[0] ?? null;
  },
};

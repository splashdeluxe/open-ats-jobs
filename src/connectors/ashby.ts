import type { Connector } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

interface AshbyJob {
  id: string; title: string; department?: string; team?: string;
  employmentType?: string; location?: string; secondaryLocations?: Array<{ location?: string }>;
  publishedAt?: string; isRemote?: boolean; workplaceType?: string; isListed?: boolean;
  address?: { postalAddress?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } };
  jobUrl?: string; applyUrl?: string; descriptionHtml?: string; descriptionPlain?: string;
  compensation?: unknown;
}

export const ashby: Connector = {
  id: 'ashby',
  label: 'Ashby',
  host: 'api.ashbyhq.com',

  listRequests(slug) {
    return [{
      url: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
    }];
  },

  parseList(body, ctx) {
    const data = safeJson<{ jobs?: AshbyJob[]; name?: string }>(body);
    return asArray<AshbyJob>(data?.jobs)
      .filter((j) => j.isListed !== false)
      .map((j): RawJob => {
        const pa = j.address?.postalAddress;
        return {
          sourceId: j.id,
          title: j.title?.trim() ?? '',
          organization: str(data?.name) ?? ctx.organization ?? ctx.slug,
          url: j.jobUrl ?? j.applyUrl ?? '',
          applyUrl: str(j.applyUrl) ?? null,
          datePosted: toIso(j.publishedAt, ctx.now),
          dateCreated: toIso(j.publishedAt, ctx.now),
          locationsRaw: cleanLocations([
            j.location,
            ...asArray<{ location?: string }>(j.secondaryLocations).map((s) => s.location),
            [pa?.addressLocality, pa?.addressRegion, pa?.addressCountry].filter(Boolean).join(', ') || null,
          ]),
          descriptionHtml: str(j.descriptionHtml),
          descriptionText: str(j.descriptionPlain),
          employmentTypeRaw: str(j.employmentType),
          departmentRaw: str(j.department) ?? str(j.team),
          salaryRaw: j.compensation ?? null,
          remoteFlag: j.isRemote ?? null,
          workplaceTypeRaw: str(j.workplaceType),
          source: 'ashby',
          sourceDomain: 'ashbyhq.com',
          companySlug: ctx.slug,
        };
      });
  },

  detect(url) {
    if (!/(^|\.)ashbyhq\.com$/.test(url.hostname)) return null;
    const seg = url.pathname.split('/').filter(Boolean);
    return seg[0] ?? null;
  },
};

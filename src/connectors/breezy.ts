import type { Connector } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

interface BreezyJob {
  id: string; friendly_id?: string; name: string; url?: string;
  published_date?: string; type?: { id?: string; name?: string };
  location?: { name?: string; city?: string; is_remote?: boolean;
    country?: { name?: string; id?: string }; state?: { name?: string; id?: string } };
  department?: string; salary?: string; company?: string;
}

export const breezy: Connector = {
  id: 'breezy',
  label: 'Breezy HR',
  host: 'breezy.hr',

  listRequests(slug) {
    return [{ url: `https://${encodeURIComponent(slug)}.breezy.hr/json` }];
  },

  parseList(body, ctx) {
    const jobs = safeJson<BreezyJob[]>(body);
    return asArray<BreezyJob>(jobs).map((j): RawJob => {
      const loc = j.location;
      return {
        sourceId: j.friendly_id ?? j.id,
        title: j.name ?? '',
        organization: str(j.company) ?? ctx.organization ?? ctx.slug,
        url: j.url ?? `https://${ctx.slug}.breezy.hr/p/${j.friendly_id ?? j.id}`,
        applyUrl: null,
        datePosted: toIso(j.published_date, ctx.now),
        dateCreated: toIso(j.published_date, ctx.now),
        locationsRaw: cleanLocations([
          [loc?.city, loc?.state?.name, loc?.country?.name].filter(Boolean).join(', ') || null,
          loc?.name,
        ]),
        descriptionHtml: null,
        descriptionText: null,
        employmentTypeRaw: str(j.type?.name),
        departmentRaw: str(j.department),
        salaryRaw: str(j.salary),
        remoteFlag: loc?.is_remote ?? null,
        workplaceTypeRaw: loc?.is_remote ? 'remote' : null,
        source: 'breezy',
        sourceDomain: 'breezy.hr',
        companySlug: ctx.slug,
      };
    });
  },

  detect(url) {
    const m = url.hostname.match(/^([a-z0-9-]+)\.breezy\.hr$/i);
    return m?.[1] ?? null;
  },
};

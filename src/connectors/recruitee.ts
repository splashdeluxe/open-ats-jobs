import type { Connector } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

interface RecruiteeOffer {
  id: number; slug?: string; title: string; company_name?: string;
  careers_url?: string; careers_apply_url?: string;
  created_at?: string; published_at?: string;
  city?: string; country?: string; location?: string;
  locations?: Array<{ city?: string; country?: string; full_address?: string }>;
  department?: string; description?: string; requirements?: string;
  employment_type_code?: string; experience_code?: string;
  salary?: { min?: number | null; max?: number | null; period?: string; currency?: string };
  remote?: boolean; hybrid?: boolean; on_site?: boolean;
  status?: string;
}

export const recruitee: Connector = {
  id: 'recruitee',
  label: 'Recruitee',
  host: 'recruitee.com',

  listRequests(slug) {
    return [{ url: `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/` }];
  },

  parseList(body, ctx) {
    const data = safeJson<{ offers?: RecruiteeOffer[] }>(body);
    return asArray<RecruiteeOffer>(data?.offers)
      .filter((o) => o.status === undefined || o.status === 'published')
      .map((o): RawJob => ({
        sourceId: String(o.id),
        title: o.title ?? '',
        organization: str(o.company_name) ?? ctx.organization ?? ctx.slug,
        url: o.careers_url ?? `https://${ctx.slug}.recruitee.com/o/${o.slug ?? o.id}`,
        applyUrl: str(o.careers_apply_url),
        datePosted: toIso(o.published_at, ctx.now) ?? toIso(o.created_at, ctx.now),
        dateCreated: toIso(o.created_at, ctx.now),
        locationsRaw: cleanLocations([
          str(o.location),
          [o.city, o.country].filter(Boolean).join(', ') || null,
          ...asArray<{ city?: string; country?: string; full_address?: string }>(o.locations)
            .map((l) => str(l.full_address) ?? ([l.city, l.country].filter(Boolean).join(', ') || null)),
        ]),
        // Recruitee splits the posting into a description and a requirements block.
        descriptionHtml: [o.description, o.requirements].filter(Boolean).join('\n') || null,
        descriptionText: null,
        employmentTypeRaw: str(o.employment_type_code),
        departmentRaw: str(o.department),
        salaryRaw: o.salary ?? null,
        remoteFlag: o.remote ?? null,
        workplaceTypeRaw: o.hybrid ? 'hybrid' : o.remote ? 'remote' : o.on_site ? 'onsite' : null,
        source: 'recruitee',
        sourceDomain: 'recruitee.com',
        companySlug: ctx.slug,
        extra: { experience: o.experience_code },
      }));
  },

  detect(url) {
    const m = url.hostname.match(/^([a-z0-9-]+)\.recruitee\.com$/i);
    return m?.[1] ?? null;
  },
};

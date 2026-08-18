import type { Connector } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

interface WkJob {
  title: string; shortcode: string; code?: string; employment_type?: string;
  telecommuting?: boolean; department?: string; url?: string; shortlink?: string;
  application_url?: string; published_on?: string; created_at?: string;
  country?: string; city?: string; state?: string; education?: string; experience?: string;
  function?: string; industry?: string; description?: string;
  locations?: Array<{ country?: string; city?: string; region?: string }>;
}

export const workable: Connector = {
  id: 'workable',
  label: 'Workable',
  host: 'apply.workable.com',

  listRequests(slug) {
    // The widget endpoint carries descriptions and structured locations; the v3 POST
    // endpoint returns neither, so it is not worth the extra request.
    return [{ url: `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true` }];
  },

  parseList(body, ctx) {
    const data = safeJson<{ name?: string; jobs?: WkJob[] }>(body);
    return asArray<WkJob>(data?.jobs).map((j): RawJob => ({
      sourceId: j.shortcode,
      title: j.title ?? '',
      organization: str(data?.name) ?? ctx.organization ?? ctx.slug,
      url: j.url ?? j.shortlink ?? '',
      applyUrl: str(j.application_url),
      datePosted: toIso(j.published_on, ctx.now),
      dateCreated: toIso(j.created_at, ctx.now),
      locationsRaw: cleanLocations([
        [j.city, j.state, j.country].filter(Boolean).join(', ') || null,
        ...asArray<{ country?: string; city?: string; region?: string }>(j.locations)
          .map((l) => [l.city, l.region, l.country].filter(Boolean).join(', ') || null),
      ]),
      descriptionHtml: str(j.description),
      descriptionText: null,
      employmentTypeRaw: str(j.employment_type),
      departmentRaw: str(j.department) ?? str(j.function),
      salaryRaw: null,
      remoteFlag: j.telecommuting ?? null,
      workplaceTypeRaw: j.telecommuting ? 'remote' : null,
      source: 'workable',
      sourceDomain: 'workable.com',
      companySlug: ctx.slug,
      extra: { experience: j.experience, education: j.education },
    }));
  },

  detect(url) {
    if (!/(^|\.)workable\.com$/.test(url.hostname)) return null;
    const seg = url.pathname.split('/').filter(Boolean);
    return seg[0] && seg[0] !== 'j' ? seg[0] : null;
  },
};

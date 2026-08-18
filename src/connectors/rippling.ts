import type { Connector } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

interface RipJob {
  uuid: string; name: string; url?: string;
  department?: { id?: string; label?: string };
  workLocation?: { label?: string };
}

interface RipDetail {
  description?: Record<string, unknown> | string;
  employmentType?: string; createdOn?: string; companyName?: string;
  payRangeDetails?: unknown; jsonLd?: unknown;
  workLocations?: Array<{ label?: string }>;
}

/** Rippling splits descriptions into named blocks; join whatever strings are in there. */
function flattenDescription(d: RipDetail['description']): string | null {
  if (typeof d === 'string') return d || null;
  if (!d || typeof d !== 'object') return null;
  const parts = Object.values(d).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return parts.length ? parts.join('\n') : null;
}

export const rippling: Connector = {
  id: 'rippling',
  label: 'Rippling',
  host: 'api.rippling.com',

  listRequests(slug) {
    return [{ url: `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(slug)}/jobs` }];
  },

  parseList(body, ctx) {
    const jobs = safeJson<RipJob[]>(body);

    // Rippling emits one row per work location, so a role open in four places
    // arrives four times under the same uuid. Group by uuid and merge the
    // locations, or the dataset ships duplicates and the job count is inflated.
    const grouped = new Map<string, { first: RipJob; locations: string[] }>();
    for (const j of asArray<RipJob>(jobs)) {
      if (!j.uuid) continue;
      const existing = grouped.get(j.uuid);
      const label = j.workLocation?.label;
      if (existing) {
        if (label) existing.locations.push(label);
      } else {
        grouped.set(j.uuid, { first: j, locations: label ? [label] : [] });
      }
    }

    return [...grouped.values()].map(({ first: j, locations }): RawJob => ({
      sourceId: j.uuid,
      title: j.name ?? '',
      organization: ctx.organization ?? ctx.slug,
      url: j.url ?? `https://ats.rippling.com/${ctx.slug}/jobs/${j.uuid}`,
      applyUrl: null,
      datePosted: null,
      dateCreated: null,
      locationsRaw: cleanLocations(locations),
      descriptionHtml: null,
      descriptionText: null,
      employmentTypeRaw: null,
      departmentRaw: str(j.department?.label),
      salaryRaw: null,
      remoteFlag: locations.some((l) => /remote/i.test(l)) || null,
      workplaceTypeRaw: null,
      source: 'rippling',
      sourceDomain: 'rippling.com',
      companySlug: ctx.slug,
    }));
  },

  detailRequest(job, ctx) {
    // The list endpoint has no dates, description or pay, so the detail call is
    // needed for anything beyond a title. Still gated behind includeDescription.
    if (!ctx.opts.includeDescription) return null;
    return { url: `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(ctx.slug)}/jobs/${job.sourceId}` };
  },

  parseDetail(body, job) {
    const d = safeJson<RipDetail>(body);
    if (!d) return {};
    return {
      descriptionHtml: flattenDescription(d.description),
      employmentTypeRaw: str(d.employmentType),
      datePosted: toIso(d.createdOn) ?? job.datePosted,
      dateCreated: toIso(d.createdOn) ?? job.dateCreated,
      organization: str(d.companyName) ?? job.organization,
      salaryRaw: d.payRangeDetails ?? d.jsonLd ?? null,
      locationsRaw: cleanLocations([
        ...job.locationsRaw,
        ...asArray<{ label?: string }>(d.workLocations).map((w) => w.label),
      ]),
    };
  },

  detect(url) {
    if (!/(^|\.)rippling\.com$/.test(url.hostname)) return null;
    const seg = url.pathname.split('/').filter(Boolean);
    return seg[0] ?? null;
  },
};

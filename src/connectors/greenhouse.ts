import type { Connector, FetchSpec, ParseContext } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, decodeEntities, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

interface GhJob {
  id: number; title: string; absolute_url: string; content?: string;
  location?: { name?: string }; offices?: Array<{ name?: string; location?: string | null }>;
  departments?: Array<{ name?: string }>; company_name?: string;
  updated_at?: string; first_published?: string; metadata?: unknown;
}

export const greenhouse: Connector = {
  id: 'greenhouse',
  label: 'Greenhouse',
  host: 'boards-api.greenhouse.io',

  listRequests(slug, opts) {
    // content=true returns full descriptions inline, which avoids a per-job second call.
    const content = opts.includeDescription ? '?content=true' : '';
    return [{ url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs${content}` }];
  },

  parseList(body, ctx) {
    const data = safeJson<{ jobs?: GhJob[] }>(body);
    return asArray<GhJob>(data?.jobs).map((j): RawJob => {
      const html = j.content ? decodeEntities(j.content) : null;
      return {
        sourceId: String(j.id),
        title: j.title ?? '',
        organization: str(j.company_name) ?? ctx.organization ?? ctx.slug,
        url: j.absolute_url,
        applyUrl: j.absolute_url,
        datePosted: toIso(j.first_published ?? j.updated_at, ctx.now),
        dateCreated: toIso(j.first_published, ctx.now),
        locationsRaw: cleanLocations([
          j.location?.name,
          ...asArray<{ name?: string }>(j.offices).map((o) => o.name),
        ]),
        descriptionHtml: html,
        descriptionText: null,
        employmentTypeRaw: null,
        departmentRaw: asArray<{ name?: string }>(j.departments)[0]?.name ?? null,
        salaryRaw: j.metadata ?? null,
        remoteFlag: /remote/i.test(j.location?.name ?? '') || null,
        workplaceTypeRaw: null,
        source: 'greenhouse',
        sourceDomain: 'greenhouse.io',
        companySlug: ctx.slug,
      };
    });
  },

  detect(url) {
    const host = url.hostname;
    if (!/(^|\.)greenhouse\.io$/.test(host) && !/job-boards\.greenhouse\.io$/.test(host)) return null;
    const seg = url.pathname.split('/').filter(Boolean);
    // boards.greenhouse.io/acme, job-boards.greenhouse.io/acme, boards.greenhouse.io/embed/job_board?for=acme
    const forParam = url.searchParams.get('for');
    if (forParam) return forParam;
    return seg[0] && seg[0] !== 'embed' ? seg[0] : null;
  },
};

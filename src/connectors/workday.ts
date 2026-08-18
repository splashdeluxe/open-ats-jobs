import type { Connector, FetchSpec } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

/**
 * Workday is the awkward one. Every customer runs their own tenant on a numbered
 * pod, the list endpoint is a POST, and descriptions live behind a second call.
 * Slugs are therefore written "tenant:pod:site", e.g. "nvidia:wd5:NVIDIAExternalCareerSite".
 */
interface WdPosting {
  title?: string; externalPath?: string; locationsText?: string;
  postedOn?: string; bulletFields?: string[];
}

const PAGE = 20;

function parseSlug(slug: string): { tenant: string; pod: string; site: string } | null {
  const [tenant, pod, site] = slug.split(':');
  if (!tenant || !pod || !site) return null;
  return { tenant, pod, site };
}

const cxsBase = (t: string, p: string, s: string) =>
  `https://${t}.${p}.myworkdayjobs.com/wday/cxs/${t}/${s}`;

export const workday: Connector = {
  id: 'workday',
  label: 'Workday',
  host: 'myworkdayjobs.com',

  listRequests(slug) {
    const p = parseSlug(slug);
    if (!p) return [];
    return [{
      url: `${cxsBase(p.tenant, p.pod, p.site)}/jobs`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ limit: PAGE, offset: 0, searchText: '' }),
      meta: { offset: 0, slug },
    }];
  },

  parseList(body, ctx) {
    const p = parseSlug(ctx.slug);
    const data = safeJson<{ total?: number; jobPostings?: WdPosting[] }>(body);
    if (!p) return [];
    const base = cxsBase(p.tenant, p.pod, p.site);
    const site = `https://${p.tenant}.${p.pod}.myworkdayjobs.com/${p.site}`;

    return asArray<WdPosting>(data?.jobPostings).map((j): RawJob => ({
      sourceId: j.bulletFields?.[0] ?? j.externalPath ?? j.title ?? '',
      title: j.title ?? '',
      organization: ctx.organization ?? p.tenant,
      url: `${site}${j.externalPath ?? ''}`,
      applyUrl: null,
      // "Posted Today" resolves against run time; the detail call replaces it with a real date.
      datePosted: toIso(j.postedOn, ctx.now),
      dateCreated: null,
      locationsRaw: cleanLocations([j.locationsText]),
      descriptionHtml: null,
      descriptionText: null,
      employmentTypeRaw: null,
      departmentRaw: null,
      salaryRaw: null,
      remoteFlag: /remote/i.test(j.locationsText ?? '') || null,
      workplaceTypeRaw: null,
      source: 'workday',
      sourceDomain: 'myworkdayjobs.com',
      companySlug: ctx.slug,
      extra: { cxsBase: base, externalPath: j.externalPath },
    }));
  },

  nextPage(body, prev, ctx) {
    const data = safeJson<{ total?: number }>(body);
    const total = data?.total ?? 0;
    const offset = Number(prev.meta?.offset ?? 0) + PAGE;
    if (offset >= total || offset >= ctx.opts.maxPages * PAGE) return null;
    return {
      ...prev,
      body: JSON.stringify({ limit: PAGE, offset, searchText: '' }),
      meta: { ...prev.meta, offset },
    };
  },

  detailRequest(job, ctx) {
    if (!ctx.opts.includeDescription) return null;
    const base = job.extra?.cxsBase;
    const path = job.extra?.externalPath;
    if (typeof base !== 'string' || typeof path !== 'string') return null;
    return { url: `${base}${path}`, headers: { Accept: 'application/json' } };
  },

  parseDetail(body, job) {
    const info = safeJson<{ jobPostingInfo?: Record<string, unknown> }>(body)?.jobPostingInfo;
    if (!info) return {};
    return {
      descriptionHtml: str(info.jobDescription),
      // startDate is an actual date, so it beats the relative string from the list page.
      datePosted: toIso(info.startDate) ?? job.datePosted,
      employmentTypeRaw: str(info.timeType),
      locationsRaw: cleanLocations([str(info.location), ...job.locationsRaw]),
      applyUrl: str(info.externalUrl),
    };
  },

  detect(url) {
    const m = url.hostname.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/i);
    if (!m) return null;
    const site = url.pathname.split('/').filter((s) => s && !/^[a-z]{2}-[A-Z]{2}$/.test(s))[0];
    return site ? `${m[1]}:${m[2]}:${site}` : null;
  },
};

import type { Connector, FetchSpec } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, safeJson, str } from './util.js';
import { toIso } from '../normalize/dates.js';

interface SrPosting {
  id: string; name: string; uuid?: string; releasedDate?: string; ref?: string;
  company?: { identifier?: string; name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean; fullLocation?: string };
  typeOfEmployment?: { label?: string }; experienceLevel?: { label?: string };
  department?: { label?: string }; function?: { label?: string }; language?: { code?: string };
}

const PAGE = 100;

export const smartrecruiters: Connector = {
  id: 'smartrecruiters',
  label: 'SmartRecruiters',
  host: 'api.smartrecruiters.com',
  requiresOptIn: true,
  optInReason:
    'api.smartrecruiters.com/robots.txt sets "User-agent: * / Disallow: /" and allows only LinkedInBot on /v1/companies/. '
    + 'Enable this connector only if you have a lawful basis to crawl it.',

  listRequests(slug) {
    return [{
      url: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=${PAGE}&offset=0`,
      meta: { offset: 0 },
    }];
  },

  parseList(body, ctx) {
    const data = safeJson<{ content?: SrPosting[] }>(body);
    return asArray<SrPosting>(data?.content).map((j): RawJob => {
      const loc = j.location;
      const company = j.company?.identifier ?? ctx.slug;
      return {
        sourceId: j.id,
        title: j.name ?? '',
        organization: str(j.company?.name) ?? ctx.organization ?? ctx.slug,
        url: `https://jobs.smartrecruiters.com/${company}/${j.id}`,
        applyUrl: null,
        datePosted: toIso(j.releasedDate, ctx.now),
        dateCreated: toIso(j.releasedDate, ctx.now),
        locationsRaw: cleanLocations([
          str(loc?.fullLocation),
          [loc?.city, loc?.region, loc?.country].filter(Boolean).join(', ') || null,
        ]),
        descriptionHtml: null,
        descriptionText: null,
        employmentTypeRaw: str(j.typeOfEmployment?.label),
        departmentRaw: str(j.department?.label) ?? str(j.function?.label),
        salaryRaw: null,
        remoteFlag: loc?.remote ?? null,
        workplaceTypeRaw: loc?.hybrid ? 'hybrid' : loc?.remote ? 'remote' : null,
        source: 'smartrecruiters',
        sourceDomain: 'smartrecruiters.com',
        companySlug: ctx.slug,
        extra: { experienceLevel: j.experienceLevel?.label },
      };
    });
  },

  nextPage(body, prev, ctx) {
    const data = safeJson<{ totalFound?: number }>(body);
    const total = data?.totalFound ?? 0;
    const offset = Number(prev.meta?.offset ?? 0) + PAGE;
    if (offset >= total || offset >= ctx.opts.maxPages * PAGE) return null;
    return {
      url: prev.url.replace(/offset=\d+/, `offset=${offset}`),
      meta: { ...prev.meta, offset },
    };
  },

  detailRequest(job, ctx) {
    if (!ctx.opts.includeDescription) return null;
    return { url: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(ctx.slug)}/postings/${job.sourceId}` };
  },

  parseDetail(body) {
    const d = safeJson<{ jobAd?: { sections?: Record<string, { text?: string; title?: string }> } }>(body);
    const sections = d?.jobAd?.sections;
    if (!sections) return {};
    const html = Object.values(sections)
      .map((s) => (s?.text ? `<h3>${s.title ?? ''}</h3>${s.text}` : ''))
      .filter(Boolean).join('\n');
    return html ? { descriptionHtml: html } : {};
  },

  detect(url) {
    if (!/(^|\.)smartrecruiters\.com$/.test(url.hostname)) return null;
    const seg = url.pathname.split('/').filter(Boolean);
    return seg[0] ?? null;
  },
};

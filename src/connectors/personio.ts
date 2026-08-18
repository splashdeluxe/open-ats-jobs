import { XMLParser } from 'fast-xml-parser';
import type { Connector } from './types.js';
import type { RawJob } from '../normalize/schema.js';
import { asArray, cleanLocations, str } from './util.js';
import { toIso } from '../normalize/dates.js';

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

interface PersonioPosition {
  id?: string | number; subcompany?: string; office?: string;
  additionalOffices?: { office?: string | string[] };
  department?: string; recruitingCategory?: string; name?: string;
  jobDescriptions?: { jobDescription?: Array<{ name?: string; value?: string }> | { name?: string; value?: string } };
  employmentType?: string; seniority?: string; schedule?: string;
  yearsOfExperience?: string; occupation?: string; occupationCategory?: string;
  createdAt?: string; keywords?: string;
}

export const personio: Connector = {
  id: 'personio',
  label: 'Personio',
  host: 'jobs.personio.de',

  listRequests(slug) {
    return [{ url: `https://${encodeURIComponent(slug)}.jobs.personio.de/xml` }];
  },

  parseList(body, ctx) {
    let doc: { 'workzag-jobs'?: { position?: PersonioPosition | PersonioPosition[] } };
    try {
      doc = parser.parse(body) as typeof doc;
    } catch {
      return [];
    }
    const raw = doc['workzag-jobs']?.position;
    const positions = Array.isArray(raw) ? raw : raw ? [raw] : [];

    return positions.map((p): RawJob => {
      const descNode = p.jobDescriptions?.jobDescription;
      const blocks = Array.isArray(descNode) ? descNode : descNode ? [descNode] : [];
      const html = blocks
        .map((b) => `<h3>${b?.name ?? ''}</h3>${b?.value ?? ''}`)
        .join('\n') || null;

      const extraOffices = p.additionalOffices?.office;
      return {
        sourceId: String(p.id ?? ''),
        title: str(p.name) ?? '',
        organization: str(p.subcompany) ?? ctx.organization ?? ctx.slug,
        url: `https://${ctx.slug}.jobs.personio.de/job/${p.id ?? ''}`,
        applyUrl: null,
        datePosted: toIso(p.createdAt, ctx.now),
        dateCreated: toIso(p.createdAt, ctx.now),
        locationsRaw: cleanLocations([
          str(p.office),
          ...(Array.isArray(extraOffices) ? extraOffices : extraOffices ? [extraOffices] : []),
        // Personio customers often prefix offices with sort keys like "zz_Hamburg".
        ]).map((o) => o.replace(/^[a-z]{1,3}[_-]/i, '')),
        descriptionHtml: html,
        descriptionText: null,
        employmentTypeRaw: str(p.schedule) ?? str(p.employmentType),
        departmentRaw: str(p.department) ?? str(p.recruitingCategory),
        salaryRaw: null,
        remoteFlag: null,
        workplaceTypeRaw: null,
        source: 'personio',
        sourceDomain: 'personio.de',
        companySlug: ctx.slug,
        extra: { seniority: p.seniority, yearsOfExperience: p.yearsOfExperience, keywords: p.keywords },
      };
    });
  },

  detect(url) {
    const m = url.hostname.match(/^([a-z0-9-]+)\.jobs\.personio\.(de|com)$/i);
    return m?.[1] ?? null;
  },
};

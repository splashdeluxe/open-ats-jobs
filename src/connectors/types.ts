import type { PlatformId, RawJob } from '../normalize/schema.js';

export interface FetchSpec {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Carried through to the parser; used for paging cursors and the like. */
  meta?: Record<string, unknown>;
}

export interface ConnectorOptions {
  includeDescription: boolean;
  maxPages: number;
}

export interface ParseContext {
  slug: string;
  organization: string | null;
  opts: ConnectorOptions;
  now: Date;
}

export interface Connector {
  id: PlatformId;
  label: string;
  /** Primary host, used for per-host rate limiting. */
  host: string;
  /** Honour a published Crawl-delay where one exists. */
  crawlDelayMs?: number;
  /** True when robots.txt tells us not to crawl. Requires the operator to opt in explicitly. */
  requiresOptIn?: boolean;
  optInReason?: string;

  listRequests(slug: string, opts: ConnectorOptions): FetchSpec[];
  parseList(body: string, ctx: ParseContext): RawJob[];
  /** Return the next page request, or null when the board is exhausted. */
  nextPage?(body: string, prev: FetchSpec, ctx: ParseContext): FetchSpec | null;
  /** Second call for platforms that keep descriptions off the list endpoint. */
  detailRequest?(job: RawJob, ctx: ParseContext): FetchSpec | null;
  parseDetail?(body: string, job: RawJob): Partial<RawJob>;
  /** Pull a board slug out of a careers URL, or null if this platform does not own it. */
  detect(url: URL): string | null;
}

import { log } from 'apify';
import { ProxyAgent, type Dispatcher } from 'undici';
import type { FetchSpec } from './connectors/types.js';

const USER_AGENT =
  'open-ats-jobs/0.1 (+https://github.com/nils4sparkloomai/open-ats-jobs; job board indexer)';

export interface FetchResult {
  status: number;
  body: string;
  etag: string | null;
  /** True when the server answered 304, so the board is unchanged and cost nothing. */
  notModified: boolean;
}

export interface FetcherOptions {
  concurrency: number;
  proxyUrl?: string | null;
  /** Per-host minimum gap between requests, honouring published Crawl-delay values. */
  hostDelays: Record<string, number>;
  maxRetries: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Fetcher {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly dispatcher: Dispatcher | undefined;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly opts: FetcherOptions) {
    this.dispatcher = opts.proxyUrl ? new ProxyAgent(opts.proxyUrl) : undefined;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.opts.concurrency) { this.active++; return; }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }

  /** Space requests per host so we stay inside whatever the platform published. */
  private async respectDelay(host: string): Promise<void> {
    const delay = this.opts.hostDelays[host] ?? 0;
    if (delay <= 0) return;
    const last = this.lastRequestAt.get(host) ?? 0;
    const wait = last + delay - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt.set(host, Date.now());
  }

  async fetch(spec: FetchSpec, etag?: string | null): Promise<FetchResult> {
    await this.acquire();
    try {
      const host = new URL(spec.url).hostname;
      await this.respectDelay(host);

      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        // These payloads are megabytes of JSON and compress hard.
        'Accept-Encoding': 'gzip, deflate, br',
        Accept: 'application/json, text/xml, */*',
        ...spec.headers,
      };
      if (etag) headers['If-None-Match'] = etag;

      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
        try {
          const res = await fetch(spec.url, {
            method: spec.method ?? 'GET',
            headers,
            body: spec.body,
            dispatcher: this.dispatcher,
            signal: AbortSignal.timeout(45_000),
          });

          if (res.status === 304) {
            return { status: 304, body: '', etag: etag ?? null, notModified: true };
          }
          // Back off on throttling and server faults; everything else is final.
          if (res.status === 429 || res.status >= 500) {
            throw new Error(`HTTP ${res.status}`);
          }
          return {
            status: res.status,
            body: await res.text(),
            etag: res.headers.get('etag'),
            notModified: false,
          };
        } catch (err) {
          lastError = err as Error;
          if (attempt < this.opts.maxRetries) {
            const backoff = 2 ** attempt * 1000 + Math.floor(Math.random() * 500);
            log.debug(`Retrying ${spec.url} in ${backoff}ms (${lastError.message})`);
            await sleep(backoff);
          }
        }
      }
      throw lastError ?? new Error(`Failed to fetch ${spec.url}`);
    } finally {
      this.release();
    }
  }
}

export { USER_AGENT };

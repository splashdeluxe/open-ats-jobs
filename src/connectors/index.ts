import type { PlatformId } from '../normalize/schema.js';
import type { Connector } from './types.js';
import { greenhouse } from './greenhouse.js';
import { lever } from './lever.js';
import { ashby } from './ashby.js';
import { workday } from './workday.js';
import { workable } from './workable.js';
import { rippling } from './rippling.js';
import { personio } from './personio.js';
import { breezy } from './breezy.js';
import { smartrecruiters } from './smartrecruiters.js';
import { recruitee } from './recruitee.js';

/**
 * The registry. Adding a platform is one import and one line here, which is the
 * only reason a long tail of ATS connectors is maintainable at all.
 */
export const CONNECTORS: readonly Connector[] = [
  greenhouse, lever, ashby, workday, workable,
  rippling, personio, breezy, smartrecruiters, recruitee,
];

export const CONNECTOR_BY_ID: ReadonlyMap<PlatformId, Connector> = new Map(
  CONNECTORS.map((c) => [c.id, c]),
);

/** Connectors that run unless explicitly disabled. Excludes anything robots.txt tells us to leave alone. */
export const DEFAULT_CONNECTORS: readonly Connector[] = CONNECTORS.filter((c) => !c.requiresOptIn);

export interface DetectedBoard { platform: PlatformId; slug: string }

/** Work out which platform a careers URL belongs to, and the board slug within it. */
export function detectBoard(rawUrl: string): DetectedBoard | null {
  let url: URL;
  try { url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`); }
  catch { return null; }

  for (const c of CONNECTORS) {
    const slug = c.detect(url);
    if (slug) return { platform: c.id, slug };
  }
  return null;
}

export type { Connector, FetchSpec, ParseContext, ConnectorOptions } from './types.js';

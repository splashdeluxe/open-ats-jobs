/** Greenhouse returns its HTML entity-encoded, so it needs decoding before anything else touches it. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

export function safeJson<T = unknown>(body: string): T | null {
  try { return JSON.parse(body) as T; } catch { return null; }
}

export const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** Drop empties and duplicates from a location list without reordering it. */
export const cleanLocations = (xs: Array<string | null | undefined>): string[] =>
  [...new Set(xs.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()))];

import { CITY_LOOKUP, COUNTRY_LOOKUP, STATE_LOOKUP, ALL_STATE_NAMES, normalizeToken, type CityRecord } from './geo.js';
import type { DerivedLocation } from './schema.js';

const REMOTE_MARKERS = [
  'remote', 'anywhere', 'work from home', 'wfh', 'distributed', 'telecommute',
  'home office', 'homeoffice', 'fully remote', 'remote-first', 'virtual',
];

/** Tokens that carry no geographic meaning but show up constantly in board data. */
const NOISE = new Set([
  'multiple locations', 'various', 'various locations', 'other', 'n/a', 'tbd',
  'flexible', 'global', 'worldwide', 'emea', 'apac', 'amer', 'latam', 'namer',
]);

export interface ParsedLocation {
  loc: DerivedLocation;
  lat: number | null;
  lng: number | null;
  remote: boolean;
}

const EMPTY: ParsedLocation = {
  loc: { city: null, admin: null, country: null },
  lat: null, lng: null, remote: false,
};

/**
 * Parse a free-text location into {city, admin, country} plus coordinates.
 *
 * Matching is positional-agnostic on purpose: Workday emits "India, Bengaluru"
 * while Greenhouse emits "Bengaluru, India", and guessing from order alone gets
 * one of them wrong every time. Instead each token is tested against the country,
 * state and city tables and assigned to whichever slot it actually fits.
 */
export function parseLocationString(input: string): ParsedLocation {
  if (!input || !input.trim()) return EMPTY;

  let working = input.trim();
  let remote = false;

  // Strip remote markers before tokenising, but remember we saw one.
  for (const marker of REMOTE_MARKERS) {
    const re = new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(working)) {
      remote = true;
      working = working.replace(re, ' ');
    }
  }

  const tokens = working
    .split(/[,|/·•]|\s+[-–—]\s+/)
    // Collapse the internal whitespace left behind by stripping remote markers,
    // so "Remote - NY  HQ" does not yield a city literally named "NY  HQ".
    .map((t) => t.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0 && !NOISE.has(normalizeToken(t)));

  if (tokens.length === 0) return { ...EMPTY, remote };

  let country: string | null = null;
  let admin: string | null = null;
  let city: string | null = null;
  let coords: CityRecord | null = null;
  const consumed = new Set<number>();

  // Country first - it is the least ambiguous signal.
  tokens.forEach((t, i) => {
    if (country) return;
    const hit = COUNTRY_LOOKUP.get(normalizeToken(t));
    if (hit) { country = hit; consumed.add(i); }
  });

  // Then admin/state, by full name or two-letter abbreviation.
  tokens.forEach((t, i) => {
    if (admin || consumed.has(i)) return;
    const n = normalizeToken(t);
    if (ALL_STATE_NAMES.has(n)) { admin = t.trim(); consumed.add(i); return; }
    if (n.length === 2) {
      const full = STATE_LOOKUP.get(n);
      if (full) { admin = full; consumed.add(i); }
    }
  });

  // Then a known city, which also gives us coordinates and fills any blanks.
  tokens.forEach((t, i) => {
    if (city || consumed.has(i)) return;
    const hit = CITY_LOOKUP.get(normalizeToken(t));
    if (hit) { city = hit.city; coords = hit; consumed.add(i); }
  });

  // Anything left over is treated as an unresolved city name rather than dropped.
  if (!city) {
    const leftover = tokens.find((_, i) => !consumed.has(i));
    if (leftover && leftover.length <= 60) city = leftover.trim();
  }

  if (coords) {
    const c: CityRecord = coords;
    if (!admin) admin = c.admin;
    if (!country) country = c.country;
    // Only trust bundled coordinates when the country agrees, so "Berlin, Maryland"
    // does not silently get plotted in Germany.
    const countryMatches = country === c.country;
    return {
      loc: { city, admin, country },
      lat: countryMatches ? c.lat : null,
      lng: countryMatches ? c.lng : null,
      remote,
    };
  }

  return { loc: { city, admin, country }, lat: null, lng: null, remote };
}

export interface LocationBundle {
  locations_derived: DerivedLocation[];
  cities_derived: string[];
  regions_derived: string[];
  countries_derived: string[];
  lats_derived: number[];
  lngs_derived: number[];
  anyRemote: boolean;
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export function buildLocationBundle(rawLocations: string[]): LocationBundle {
  const parsed = rawLocations.map(parseLocationString);
  const meaningful = parsed.filter((p) => p.loc.city || p.loc.admin || p.loc.country);

  return {
    locations_derived: meaningful.map((p) => p.loc),
    cities_derived: uniq(meaningful.map((p) => p.loc.city ?? '')),
    regions_derived: uniq(meaningful.map((p) => p.loc.admin ?? '')),
    countries_derived: uniq(meaningful.map((p) => p.loc.country ?? '')),
    lats_derived: meaningful.map((p) => p.lat).filter((v): v is number => v !== null),
    lngs_derived: meaningful.map((p) => p.lng).filter((v): v is number => v !== null),
    anyRemote: parsed.some((p) => p.remote),
  };
}

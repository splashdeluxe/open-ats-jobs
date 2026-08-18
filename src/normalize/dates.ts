/**
 * Workday does not return a timestamp on its list endpoint. It returns prose:
 * "Posted Today", "Posted 3 Days Ago", "Posted 30+ Days Ago". These have to be
 * resolved against run time, so the result is approximate by nature and we floor
 * it to the start of the day to keep repeated runs stable.
 */
export function parseRelativeDate(input: string, now = new Date()): string | null {
  if (!input) return null;
  const s = input.toLowerCase().replace(/^posted\s+/, '').trim();

  const atMidnight = (d: Date) => {
    const c = new Date(d);
    c.setUTCHours(0, 0, 0, 0);
    return c.toISOString();
  };

  if (/^(today|just posted)/.test(s)) return atMidnight(now);
  if (/^yesterday/.test(s)) return atMidnight(new Date(now.getTime() - 864e5));

  const m = s.match(/(\d+)\+?\s*(day|week|month|year|hour)s?\s*ago/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2];
    const ms =
      unit === 'hour' ? n * 36e5 :
      unit === 'day' ? n * 864e5 :
      unit === 'week' ? n * 7 * 864e5 :
      unit === 'month' ? n * 30 * 864e5 :
      n * 365 * 864e5;
    return atMidnight(new Date(now.getTime() - ms));
  }
  return null;
}

/** Accept whatever a platform gives us and return ISO 8601, or null if it is not a real date. */
export function toIso(input: unknown, now = new Date()): string | null {
  if (input === null || input === undefined) return null;

  if (typeof input === 'number') {
    // Distinguish seconds from milliseconds without guessing wildly.
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    if (/posted|ago|today|yesterday/i.test(s)) return parseRelativeDate(s, now);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    const numeric = Number(s);
    if (Number.isFinite(numeric) && numeric > 1e9) return toIso(numeric, now);
  }
  return null;
}

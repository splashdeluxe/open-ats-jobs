export interface SalaryResult {
  currency: string | null;
  min: number | null;
  max: number | null;
  unitText: string | null;
}

const NONE: SalaryResult = { currency: null, min: null, max: null, unitText: null };

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  $: 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', '¥': 'JPY', '₺': 'TRY',
  '₪': 'ILS', 'R$': 'BRL', 'C$': 'CAD', 'A$': 'AUD', 'zł': 'PLN', 'CHF': 'CHF',
};

/** Map every interval spelling we have actually seen onto schema.org unitText values. */
function normalizeInterval(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase();
  if (/hour|hourly|\/\s*hr/.test(s)) return 'HOUR';
  if (/\bday|daily|per diem/.test(s)) return 'DAY';
  if (/week/.test(s)) return 'WEEK';
  if (/month/.test(s)) return 'MONTH';
  if (/year|annual|annum|p\.?a\.?/.test(s)) return 'YEAR';
  return null;
}

/**
 * Parse a number as written in a job ad.
 * Handles "211.4K", "150,000" and the European "60.000" (which means sixty thousand,
 * not sixty). The rule for the last case: a dot followed by exactly three digits,
 * with no other decimal marker present, is a thousands separator.
 */
export function parseMoney(token: string): number | null {
  let s = token.trim().replace(/[^\d.,kKmM]/g, '');
  if (!s) return null;

  let multiplier = 1;
  if (/[kK]$/.test(s)) { multiplier = 1_000; s = s.slice(0, -1); }
  else if (/[mM]$/.test(s)) { multiplier = 1_000_000; s = s.slice(0, -1); }

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // Whichever separator comes last is the decimal point.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    s = /,\d{3}(\D|$)/.test(s + ' ') ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot) {
    if (/\.\d{3}$/.test(s) && multiplier === 1) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Keep two decimals rather than rounding to an integer: hourly rates are the
  // whole reason this matters ("$24.50 / hour" must not become 25, and "$0.05"
  // must not become 0).
  return Math.round(n * multiplier * 100) / 100;
}

function detectCurrency(text: string): string | null {
  const iso = text.match(/\b(USD|EUR|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|INR|JPY|CAD|AUD|NZD|SGD|HKD|ILS|BRL|MXN|ZAR|AED|TRY)\b/);
  if (iso?.[1]) return iso[1];
  for (const [sym, code] of Object.entries(SYMBOL_TO_CURRENCY)) {
    if (text.includes(sym)) return code;
  }
  return null;
}

/** Walk an arbitrary ATS payload looking for a salary-shaped object. Covers Lever and Ashby in one pass. */
function fromStructured(node: unknown, depth = 0): SalaryResult | null {
  if (!node || typeof node !== 'object' || depth > 6) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = fromStructured(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  const o = node as Record<string, unknown>;

  // Skip equity/bonus components; we only want base salary.
  const type = typeof o.compensationType === 'string' ? o.compensationType.toLowerCase() : '';
  const isNonSalaryComponent = type !== '' && !type.includes('salary');

  const minRaw = o.minValue ?? o.min ?? o.minimum ?? o.salaryMin ?? o.min_value;
  const maxRaw = o.maxValue ?? o.max ?? o.maximum ?? o.salaryMax ?? o.max_value;
  const min = typeof minRaw === 'number' ? minRaw : typeof minRaw === 'string' ? parseMoney(minRaw) : null;
  const max = typeof maxRaw === 'number' ? maxRaw : typeof maxRaw === 'string' ? parseMoney(maxRaw) : null;

  if (!isNonSalaryComponent && (min !== null || max !== null)) {
    const currency = (typeof o.currencyCode === 'string' && o.currencyCode)
      || (typeof o.currency === 'string' && o.currency)
      || null;
    const unitText = normalizeInterval(o.interval ?? o.unitText ?? o.period ?? o.unit);
    return { currency: currency || null, min, max, unitText };
  }

  for (const value of Object.values(o)) {
    const hit = fromStructured(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Ranges written in prose: "$211.4K – $290.6K", "€60.000 - €80.000", "$0.05 – $0.06 / hour". */
function fromText(text: string): SalaryResult | null {
  const RANGE = /([$€£₹¥₺₪]|R\$|C\$|A\$|USD|EUR|GBP|CHF|SEK|PLN|INR|CAD|AUD)\s?([\d.,]+\s?[kKmM]?)\s*(?:–|-|—|to|bis|until)\s*([$€£₹¥₺₪]|R\$|C\$|A\$)?\s?([\d.,]+\s?[kKmM]?)/;
  const m = text.match(RANGE);
  if (!m) return null;

  const min = parseMoney(m[2] ?? '');
  const max = parseMoney(m[4] ?? '');
  if (min === null && max === null) return null;

  // Look just past the match for a cadence word.
  const tail = text.slice(text.indexOf(m[0]), text.indexOf(m[0]) + m[0].length + 40);
  return {
    currency: detectCurrency(m[0]) ?? detectCurrency(text.slice(0, 400)),
    min, max,
    unitText: normalizeInterval(tail) ?? (min !== null && min < 500 ? 'HOUR' : 'YEAR'),
  };
}

/**
 * Structured platform data first, prose only as a fallback.
 * The structured path is both cheaper and far more reliable, which is the whole
 * reason this runs before anything touches a language model.
 */
export function extractSalary(salaryRaw: unknown, text?: string | null): SalaryResult {
  if (typeof salaryRaw === 'string' && salaryRaw.trim()) {
    const hit = fromText(salaryRaw);
    if (hit) return hit;
  }
  const structured = fromStructured(salaryRaw);
  if (structured && (structured.min !== null || structured.max !== null)) {
    return {
      ...structured,
      currency: structured.currency ?? (typeof salaryRaw === 'string' ? detectCurrency(salaryRaw) : null),
      unitText: structured.unitText ?? 'YEAR',
    };
  }
  if (text) {
    const hit = fromText(text.slice(0, 6000));
    if (hit) return hit;
  }
  return NONE;
}

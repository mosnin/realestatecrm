/**
 * Area normalization — the pure glue that maps a property (or a free-text
 * "where") to a single canonical area handle so Property IQ can cache and reuse
 * one report per neighborhood.
 *
 * The handle (`areaKey`) is ZIP-first because a ZIP is the tightest area a
 * realtor reasons about and the most reliable join key; when there's no ZIP we
 * fall back to a city+state slug. Two properties in the same ZIP (or same
 * city+state) therefore resolve to the SAME report and share the research.
 *
 * All pure + dependency-free so it's trivially unit-tested and safe to import
 * from anywhere (client or server).
 */

/** Raw location parts, as they sit on a Property row or arrive from the UI. */
export interface AreaInput {
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
}

/** A resolved, canonical area. `areaKey` is stable; `label` is for humans. */
export interface NormalizedArea {
  areaKey: string;
  label: string;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
}

const US_ZIP = /\b(\d{5})(?:-\d{4})?\b/;

/** Lowercase, collapse spaces, strip anything that isn't a word char or space. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanPart(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Extract a clean 5-digit US ZIP from a value, or null. */
function zip5(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(US_ZIP);
  return m ? m[1] : null;
}

/**
 * Normalize location parts into a canonical area. Returns null when there isn't
 * enough to identify an area (need a ZIP, or a city + state). Casing/whitespace
 * in the inputs never changes the key — "Austin , TX" and "austin tx" collapse
 * to the same handle.
 */
export function normalizeArea(input: AreaInput): NormalizedArea | null {
  const city = cleanPart(input.city);
  const stateRegion = cleanPart(input.stateRegion);
  const postalCode = zip5(input.postalCode) ?? cleanPart(input.postalCode);

  const zip = zip5(postalCode);

  // ZIP-first: the tightest, most reliable area handle.
  if (zip) {
    const label = [city, stateRegion].filter(Boolean).join(', ');
    return {
      areaKey: `zip:${zip}`,
      label: label ? `${label} ${zip}` : zip,
      city,
      stateRegion,
      postalCode: zip,
    };
  }

  // Fall back to city + state. Need both to avoid colliding two "Springfield"s.
  if (city && stateRegion) {
    return {
      areaKey: `city:${slug(city)}-${slug(stateRegion)}`,
      label: `${city}, ${stateRegion}`,
      city,
      stateRegion,
      postalCode: null,
    };
  }

  return null;
}

/**
 * Parse a free-text "where" the realtor typed in chat into area parts, then
 * normalize. Handles the common shapes:
 *   "78704"                      → ZIP
 *   "Austin, TX"                 → city, state
 *   "Austin TX 78704"            → city, state, ZIP
 *   "412 Elm St, Austin, TX"     → drops the street, keeps city/state
 *   "the East Austin neighborhood" → city = "East Austin" (best effort, no state → null)
 *
 * Returns null when nothing identifiable is found, so callers can ask for a
 * clearer location instead of researching garbage.
 */
export function parseAreaQuery(text: string): NormalizedArea | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;

  const zip = zip5(raw);
  const stateRegion = matchState(raw);

  // Split on commas; the last comma-segment that isn't the state/zip is usually
  // the city (e.g. "412 Elm St, Austin, TX" → "Austin").
  const segments = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let city: string | null = null;
  if (segments.length >= 2) {
    // Prefer the second-to-last segment when the last looks like a state/zip.
    const last = segments[segments.length - 1];
    const lastIsStateOrZip = Boolean(matchState(last) || zip5(last));
    const cityIdx = lastIsStateOrZip ? segments.length - 2 : segments.length - 1;
    city = stripZipAndState(segments[cityIdx]);
  } else if (segments.length === 1 && !zip && !stateRegion) {
    // Single token with no zip/state — treat the whole thing as a place name.
    city = stripZipAndState(segments[0]) || null;
  } else if (!city && stateRegion) {
    // "Austin TX" with no comma — take everything before the state token.
    const beforeState = raw.slice(0, raw.toUpperCase().lastIndexOf(stateRegion.toUpperCase()));
    city = stripZipAndState(beforeState) || null;
  }

  return normalizeArea({ city, stateRegion, postalCode: zip });
}

/** US state abbreviations + a few full names we map to their codes. */
const STATE_ABBR = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC',
]);

/** Find a trailing/standalone US state code (e.g. "TX"). Returns the code or null. */
function matchState(text: string): string | null {
  const tokens = text.toUpperCase().match(/\b[A-Z]{2}\b/g);
  if (!tokens) return null;
  // Prefer the LAST 2-letter token that's a real state code ("Austin TX").
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (STATE_ABBR.has(tokens[i])) return tokens[i];
  }
  return null;
}

/** Drop any zip / trailing state token / stray punctuation from a city segment. */
function stripZipAndState(segment: string): string {
  let s = (segment ?? '').replace(US_ZIP, ' ');
  // Remove a trailing standalone state code.
  s = s.replace(/\b[A-Za-z]{2}\b\s*$/u, (m) =>
    STATE_ABBR.has(m.trim().toUpperCase()) ? '' : m,
  );
  return s.replace(/\s+/g, ' ').trim();
}

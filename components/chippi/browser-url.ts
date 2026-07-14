/**
 * URL handling for the RightPanel "Browser" tab.
 *
 * Pure functions, no React — exported separately so the address-bar behavior
 * (scheme rejection, https:// prepending) is unit-testable directly
 * (see tests/components/browser-url.test.ts).
 */

/** localStorage key for the last browsed URL, scoped per space. */
export function browserUrlStorageKey(slug: string): string {
  return `chippi-browser-url:${slug}`;
}

// Schemes that must never reach an iframe src, checked case-insensitively on
// the raw input BEFORE any parsing. The http/https whitelist below would catch
// these anyway — this is the explicit, readable first line of defense.
const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file|blob|about):/i;

// "something://" — input already carries an explicit scheme.
const HAS_EXPLICIT_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
// "something:" where "something" is a scheme, not a host. "localhost:3000" and
// "example.com:8080" look scheme-ish to a naive regex, so we only treat the
// prefix as a scheme when what follows the colon is NOT a digit (ports are
// digits; scheme payloads like `mailto:x` / `javascript:alert(1)` are not).
const SCHEME_LIKE_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:(?!\d)/;

/**
 * Normalize address-bar input into a safe, embeddable URL.
 *
 * - Trims whitespace; empty input → null.
 * - Rejects javascript:, data:, and every other non-http(s) scheme → null.
 * - Prepends `https://` when no scheme is given ("example.com", "localhost:3000").
 * - Requires a plausible host (contains a dot, or is localhost) so stray words
 *   like "hello" don't navigate anywhere.
 *
 * Returns the normalized absolute URL, or null when the input is not a
 * navigable web address.
 */
export function normalizeBrowserUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (BLOCKED_SCHEMES.test(trimmed)) return null;

  let candidate: string;
  if (HAS_EXPLICIT_SCHEME.test(trimmed)) {
    candidate = trimmed;
  } else if (SCHEME_LIKE_PREFIX.test(trimmed)) {
    // Some other scheme without "//" (mailto:, tel:, …) — not embeddable.
    return null;
  } else {
    candidate = `https://${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!host || (!host.includes('.') && host !== 'localhost')) return null;

  return url.href;
}

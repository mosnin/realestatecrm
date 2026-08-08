/**
 * i18n market registry — the single source of truth for how a visitor's
 * COUNTRY resolves to a LANGUAGE (which copy they read) and a CURRENCY
 * (which prices they see). Language and currency are deliberately separate
 * dimensions: a Spanish speaker in Chile reads the same es-419 copy as one
 * in Colombia but sees CLP vs COP; a visitor in Berlin or Dubai reads the
 * English copy but sees EUR / AED.
 *
 * Resolution order everywhere in the product:
 *   1. Explicit user choice (profile fields for logged-in users, the
 *      `chippi_lang` / `chippi_currency` cookies for logged-out visitors).
 *   2. Geo (Vercel's `x-vercel-ip-country` header, read in middleware).
 *   3. Default: English / USD — the American English site is the canonical
 *      base version of the product.
 *
 * Pure TS with no imports so it is safe in Edge middleware, server
 * components, and client components alike.
 */

/** Languages the marketing site ships. `en` (American English) is the base;
 *  `es` is neutral Latin-American Spanish (es-419); `ru` is formal Russian. */
export type Lang = 'en' | 'es' | 'ru';
export const LANGS: readonly Lang[] = ['en', 'es', 'ru'] as const;
export const DEFAULT_LANG: Lang = 'en';

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'es' || v === 'ru';
}

/** BCP-47 tags used for <html lang>, hreflang, and Intl formatting. */
export const LANG_TAG: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-419',
  ru: 'ru',
};

/** Native-name labels for the language switcher. */
export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  es: 'Español',
  ru: 'Русский',
};

/** Currencies we display. Every entry MUST have a rate in lib/i18n/currency.ts
 *  (a test enforces this). RUB is intentionally absent: Stripe does not
 *  support RUB, so Russian-language visitors see USD (or the currency of the
 *  country they're actually in — a Russian speaker in Dubai sees AED). */
export type Currency =
  | 'USD'
  | 'EUR'
  | 'AED'
  | 'ARS'
  | 'BOB'
  | 'CLP'
  | 'COP'
  | 'MXN'
  | 'PEN'
  | 'PYG'
  | 'UYU';

export const DEFAULT_CURRENCY: Currency = 'USD';

const CURRENCIES: readonly Currency[] = [
  'USD', 'EUR', 'AED', 'ARS', 'BOB', 'CLP', 'COP', 'MXN', 'PEN', 'PYG', 'UYU',
] as const;

export function isCurrency(v: unknown): v is Currency {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}

/** Spanish-language countries (ISO-3166 alpha-2) → es copy. Spain included:
 *  the neutral es-419 register reads fine there and Spain bills in EUR. */
const ES_COUNTRIES = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GT', 'HN', 'MX',
  'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE',
]);

/** Russian-language countries → ru copy. */
const RU_COUNTRIES = new Set(['RU', 'BY', 'KZ', 'KG']);

/** Eurozone (currency only — language stays en outside Spain). */
const EUR_COUNTRIES = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
]);

/** Country → display currency. Anything unmapped falls back to USD.
 *  Dollarized economies (EC, SV, PA) and hyper-inflationary ones (VE) stay
 *  USD on purpose — showing a "local" price there would be wrong or absurd. */
const COUNTRY_CURRENCY: Record<string, Currency> = {
  AE: 'AED',
  AR: 'ARS',
  BO: 'BOB',
  CL: 'CLP',
  CO: 'COP',
  MX: 'MXN',
  PE: 'PEN',
  PY: 'PYG',
  UY: 'UYU',
};

export interface Market {
  lang: Lang;
  currency: Currency;
}

/** Resolve a visitor's market from an ISO country code (case-insensitive,
 *  null/garbage-safe — unknown input is the en/USD base market). */
export function resolveMarket(country: string | null | undefined): Market {
  const c = (country ?? '').trim().toUpperCase();
  const lang: Lang = ES_COUNTRIES.has(c) ? 'es' : RU_COUNTRIES.has(c) ? 'ru' : 'en';
  const currency: Currency = EUR_COUNTRIES.has(c)
    ? 'EUR'
    : COUNTRY_CURRENCY[c] ?? DEFAULT_CURRENCY;
  return { lang, currency };
}

/** Cookie names shared by middleware (writer) and client components (readers).
 *  `chippi_lang` records a language preference (geo-derived or explicit via
 *  `?hl=`); `chippi_currency` records the display currency. */
export const LANG_COOKIE = 'chippi_lang';
export const CURRENCY_COOKIE = 'chippi_currency';

/**
 * Marketing paths that exist in every language tree (`/pricing` ↔
 * `/es/pricing` ↔ `/ru/pricing`). The middleware only auto-redirects across
 * languages for paths in this list, so a page can't be redirected to a
 * translation that hasn't shipped yet. Grow this list as pages are localized.
 */
export const LOCALIZED_PATHS: readonly string[] = ['/pricing'];

/** `/es/pricing` → { lang: 'es', basePath: '/pricing' }; `/pricing` → en. */
export function splitLocalizedPath(pathname: string): { lang: Lang; basePath: string } {
  const m = pathname.match(/^\/(es|ru)(\/.*)?$/);
  if (m) return { lang: m[1] as Lang, basePath: m[2] || '/' };
  return { lang: 'en', basePath: pathname };
}

/** Canonical URL path for a base path in a language. */
export function localizedPath(basePath: string, lang: Lang): string {
  if (lang === 'en') return basePath;
  return basePath === '/' ? `/${lang}` : `/${lang}${basePath}`;
}

/**
 * The pure language-routing decision the middleware executes — extracted so
 * behavior is unit-testable without Clerk/Next plumbing.
 *
 * Inputs: the request path, the visitor's country, the `chippi_lang` cookie,
 * and an explicit `?hl=` override. Output: the lang to persist in the cookie
 * and, when the visitor should be reading this page in another language, the
 * path to 302 to.
 *
 * Rules:
 *  - `?hl=` (the language switcher) always wins and re-pins the cookie.
 *  - A language-PREFIXED URL (`/es/...`, `/ru/...`) is itself an explicit
 *    choice: it always renders as-is — a shared Spanish link, or Googlebot
 *    crawling `/es/pricing` from a US IP, must never bounce to another
 *    language. Geo/cookie never redirect off a prefixed page.
 *  - On the UNPREFIXED base pages, cookie wins over geo, and geo only applies
 *    when there is no cookie: first visit from Santiago to `/pricing` lands on
 *    `/es/pricing`; a bot crawling from a US IP stays on the base version.
 *  - Redirects only target translations that actually exist (LOCALIZED_PATHS).
 */
export function decideLangRouting(input: {
  pathname: string;
  country: string | null | undefined;
  cookieLang: string | null | undefined;
  hlParam: string | null | undefined;
}): { lang: Lang; redirectTo: string | null; setCookie: boolean } {
  const { lang: pageLang, basePath } = splitLocalizedPath(input.pathname);

  const explicit = isLang(input.hlParam) ? input.hlParam : null;
  const cookie = isLang(input.cookieLang) ? input.cookieLang : null;
  const geo = resolveMarket(input.country).lang;

  // Only pages with a full translation set participate in cross-language
  // redirects; everything else renders whatever language tree it lives in.
  const translatable = LOCALIZED_PATHS.includes(basePath);

  if (explicit) {
    return {
      lang: explicit,
      redirectTo:
        translatable && explicit !== pageLang ? localizedPath(basePath, explicit) : null,
      setCookie: explicit !== cookie,
    };
  }

  // Prefixed URL = explicit choice: render it, touch nothing.
  if (pageLang !== DEFAULT_LANG) {
    return { lang: pageLang, redirectTo: null, setCookie: false };
  }

  const lang = cookie ?? geo;
  return {
    lang,
    redirectTo: translatable && lang !== pageLang ? localizedPath(basePath, lang) : null,
    // Persist a first visit's geo-settled language so the choice is stable.
    setCookie: cookie === null,
  };
}

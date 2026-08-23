/**
 * Logged-out i18n engine: country → market resolution, the middleware's
 * language-routing decision, currency conversion with clean rounding, and
 * dictionary integrity (every language carries every key and every
 * interpolation token of the canonical English copy — the mechanism behind
 * "English is the base; changes must reflect in every language").
 */

import { describe, it, expect } from 'vitest';
import {
  resolveMarket,
  decideLangRouting,
  splitLocalizedPath,
  localizedPath,
  LOCALIZED_PATHS,
  LANGS,
  isCurrency,
  type Currency,
} from '@/lib/i18n/markets';
import {
  PINNED_USD_RATES,
  cleanRound,
  localizePrice,
  formatMoney,
  formatUsdPriceIn,
} from '@/lib/i18n/currency';
import { PRICING_DICTS, fill, pluralWord } from '@/lib/i18n/dictionaries/pricing';
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import { CHROME_DICTS } from '@/lib/i18n/dictionaries/chrome';
import { AUTH_DICTS } from '@/lib/i18n/dictionaries/auth';
import { PLANS, TOPUPS } from '@/lib/plans';

describe('resolveMarket', () => {
  it('maps the four launch markets', () => {
    expect(resolveMarket('AE')).toEqual({ lang: 'en', currency: 'AED' }); // UAE
    expect(resolveMarket('DE')).toEqual({ lang: 'en', currency: 'EUR' }); // EU
    expect(resolveMarket('CL')).toEqual({ lang: 'es', currency: 'CLP' }); // South America
    expect(resolveMarket('RU')).toEqual({ lang: 'ru', currency: 'USD' }); // Russian (no RUB via Stripe)
  });

  it('separates language from currency (Spanish ≠ one currency)', () => {
    expect(resolveMarket('CO')).toEqual({ lang: 'es', currency: 'COP' });
    expect(resolveMarket('AR')).toEqual({ lang: 'es', currency: 'ARS' });
    expect(resolveMarket('ES')).toEqual({ lang: 'es', currency: 'EUR' });
    expect(resolveMarket('EC')).toEqual({ lang: 'es', currency: 'USD' }); // dollarized
  });

  it('defaults to the en/USD base for US, unknown, and garbage input', () => {
    expect(resolveMarket('US')).toEqual({ lang: 'en', currency: 'USD' });
    expect(resolveMarket('JP')).toEqual({ lang: 'en', currency: 'USD' });
    expect(resolveMarket(null)).toEqual({ lang: 'en', currency: 'USD' });
    expect(resolveMarket('  cl ')).toEqual({ lang: 'es', currency: 'CLP' }); // case/space tolerant
  });

  it('every currency it can emit has a pinned rate', () => {
    const countries = ['AE', 'DE', 'AR', 'BO', 'CL', 'CO', 'MX', 'PE', 'PY', 'UY', 'US', 'RU', 'ZZ'];
    for (const c of countries) {
      const { currency } = resolveMarket(c);
      expect(isCurrency(currency)).toBe(true);
      expect(PINNED_USD_RATES[currency]).toBeGreaterThan(0);
    }
  });
});

describe('decideLangRouting (middleware language decision)', () => {
  it('geo redirects a first visit to the translated page', () => {
    const d = decideLangRouting({ pathname: '/pricing', country: 'CL', cookieLang: null, hlParam: null });
    expect(d).toEqual({ lang: 'es', redirectTo: '/es/pricing', setCookie: true });
  });

  it('geo redirects the homepage now that every offer line is translated', () => {
    const d = decideLangRouting({ pathname: '/', country: 'CL', cookieLang: null, hlParam: null });
    expect(d).toEqual({ lang: 'es', redirectTo: '/es', setCookie: true });
  });

  it('never redirects US/unknown visitors (crawler-safe: base stays base)', () => {
    expect(decideLangRouting({ pathname: '/pricing', country: 'US', cookieLang: null, hlParam: null }).redirectTo).toBeNull();
    expect(decideLangRouting({ pathname: '/pricing', country: null, cookieLang: null, hlParam: null }).redirectTo).toBeNull();
  });

  it('cookie beats geo', () => {
    const d = decideLangRouting({ pathname: '/pricing', country: 'CL', cookieLang: 'en', hlParam: null });
    expect(d.redirectTo).toBeNull();
    expect(d.setCookie).toBe(false);
  });

  it('?hl= beats cookie and re-pins it (the language switcher escape hatch)', () => {
    const d = decideLangRouting({ pathname: '/es/pricing', country: 'CL', cookieLang: 'es', hlParam: 'en' });
    expect(d).toEqual({ lang: 'en', redirectTo: '/pricing', setCookie: true });
  });

  it('no redirect onto translations that do not exist yet', () => {
    const d = decideLangRouting({ pathname: '/realtors', country: 'CL', cookieLang: null, hlParam: null });
    expect(d.redirectTo).toBeNull(); // /realtors not in LOCALIZED_PATHS yet
  });

  it('a prefixed URL is an explicit choice — never bounced by geo or cookie', () => {
    // Shared Spanish link opened by a cookie-less US visitor (or Googlebot).
    const bot = decideLangRouting({ pathname: '/es/pricing', country: 'US', cookieLang: null, hlParam: null });
    expect(bot.redirectTo).toBeNull();
    expect(bot.setCookie).toBe(false); // peeking at a language doesn't pin it
    // Even a conflicting cookie doesn't override the URL the visitor opened.
    const conflict = decideLangRouting({ pathname: '/ru/pricing', country: 'CL', cookieLang: 'es', hlParam: null });
    expect(conflict.redirectTo).toBeNull();
  });

  it('sends a cookie-holding visitor from the base path to their language', () => {
    const d = decideLangRouting({ pathname: '/pricing', country: 'US', cookieLang: 'ru', hlParam: null });
    expect(d.redirectTo).toBe('/ru/pricing');
  });

  it('path helpers round-trip', () => {
    expect(splitLocalizedPath('/es/pricing')).toEqual({ lang: 'es', basePath: '/pricing' });
    expect(splitLocalizedPath('/pricing')).toEqual({ lang: 'en', basePath: '/pricing' });
    expect(splitLocalizedPath('/es')).toEqual({ lang: 'es', basePath: '/' });
    for (const p of LOCALIZED_PATHS) {
      expect(localizedPath(p, 'en')).toBe(p);
      expect(splitLocalizedPath(localizedPath(p, 'es'))).toEqual({ lang: 'es', basePath: p });
    }
  });
});

describe('currency conversion with clean endings', () => {
  it('always yields whole numbers — never cent values', () => {
    const currencies = Object.keys(PINNED_USD_RATES) as Currency[];
    const usdPoints = [
      ...Object.values(PLANS).map((p) => p.priceMonthly),
      ...Object.values(PLANS).flatMap((p) => (p.addUser ? [p.addUser.priceMonthly] : [])),
      ...Object.values(TOPUPS).map((t) => t.price),
    ].filter((n) => n > 0);
    for (const cur of currencies) {
      for (const usd of usdPoints) {
        const local = localizePrice(usd, cur);
        expect(Number.isInteger(local)).toBe(true);
        expect(local).toBeGreaterThan(0);
      }
    }
  });

  it('rounds big-denomination currencies to round figures', () => {
    // $97 in CLP (~92,150 raw) must land on a 500-step; COP (~397,700) on 5,000.
    expect(localizePrice(97, 'CLP') % 500).toBe(0);
    expect(localizePrice(97, 'COP') % 5000).toBe(0);
    expect(localizePrice(97, 'PYG') % 5000).toBe(0);
  });

  it('USD base prices pass through exactly (the American version is canonical)', () => {
    for (const p of Object.values(PLANS)) {
      expect(localizePrice(p.priceMonthly, 'USD')).toBe(p.priceMonthly);
    }
  });

  it('cleanRound is defensive on garbage', () => {
    expect(cleanRound(0)).toBe(0);
    expect(cleanRound(-5)).toBe(0);
    expect(cleanRound(NaN)).toBe(0);
    expect(cleanRound(Infinity)).toBe(0);
  });

  it('formats without decimals in every language', () => {
    for (const lang of LANGS) {
      const s = formatMoney(localizePrice(97, 'EUR'), 'EUR', lang);
      expect(s).not.toMatch(/[.,]\d{2}\b/); // no cent tails
      expect(formatUsdPriceIn(97, 'AED', lang)).toContain('355'); // 97 × 3.6725 → clean 355
    }
  });
});

/** Recursively collect every string leaf with its object path. */
function stringLeaves(obj: unknown, path = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[path, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => stringLeaves(v, `${path}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => stringLeaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

const tokensOf = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('pricing dictionaries (en is the canonical base)', () => {
  const enLeaves = new Map(stringLeaves(PRICING_DICTS.en));

  it.each(['es', 'ru'] as const)('%s carries every en key, non-empty', (lang) => {
    const leaves = new Map(stringLeaves(PRICING_DICTS[lang]));
    for (const key of enLeaves.keys()) {
      // creditForms legitimately differs per language (ru has few/many).
      if (key.startsWith('credits.creditForms')) continue;
      expect(leaves.has(key), `missing "${key}" in ${lang}`).toBe(true);
      expect((leaves.get(key) ?? '').trim().length, `empty "${key}" in ${lang}`).toBeGreaterThan(0);
    }
  });

  it.each(['es', 'ru'] as const)('%s preserves every interpolation token', (lang) => {
    const leaves = new Map(stringLeaves(PRICING_DICTS[lang]));
    for (const [key, enVal] of enLeaves) {
      if (key.startsWith('credits.creditForms')) continue;
      const want = tokensOf(enVal);
      if (want.length === 0) continue;
      expect(tokensOf(leaves.get(key) ?? ''), `token mismatch at "${key}" in ${lang}`).toEqual(want);
    }
  });

  it('no dollar amounts are hardcoded in any language prose', () => {
    for (const lang of LANGS) {
      for (const [key, val] of stringLeaves(PRICING_DICTS[lang])) {
        expect(val, `hardcoded price at "${key}" in ${lang}`).not.toMatch(/\$\s?\d/);
      }
    }
  });

  it('fill interpolates and leaves unknown tokens visible', () => {
    expect(fill('{n} seats', { n: 5 })).toBe('5 seats');
    expect(fill('{teamSeat} on Team', {})).toBe('{teamSeat} on Team');
  });

  it('pluralWord declines Russian correctly (one/few/many)', () => {
    const forms = PRICING_DICTS.ru.credits.creditForms;
    expect(pluralWord('ru', 1, forms)).toBe('кредит');
    expect(pluralWord('ru', 3, forms)).toBe('кредита');
    expect(pluralWord('ru', 15, forms)).toBe('кредитов');
    expect(pluralWord('en', 1, PRICING_DICTS.en.credits.creditForms)).toBe('credit');
    expect(pluralWord('en', 10, PRICING_DICTS.en.credits.creditForms)).toBe('credits');
  });
});

describe('homepage dictionaries (en is the canonical base)', () => {
  const enLeaves = new Map(stringLeaves(HOME_DICTS.en));

  it.each(['es', 'ru'] as const)('%s carries every en key and token', (lang) => {
    const leaves = new Map(stringLeaves(HOME_DICTS[lang]));
    for (const [key, enVal] of enLeaves) {
      expect((leaves.get(key) ?? '').trim().length, `missing or empty "${key}" in ${lang}`).toBeGreaterThan(0);
      expect(tokensOf(leaves.get(key) ?? ''), `token mismatch at "${key}" in ${lang}`).toEqual(tokensOf(enVal));
    }
  });
});

describe.each([
  ['marketing chrome', CHROME_DICTS],
  ['authentication', AUTH_DICTS],
] as const)('%s dictionaries', (_name, dictionaries) => {
  const enLeaves = new Map(stringLeaves(dictionaries.en));

  it.each(['es', 'ru'] as const)('%s carries every en key', (lang) => {
    const leaves = new Map(stringLeaves(dictionaries[lang]));
    for (const key of enLeaves.keys()) {
      expect((leaves.get(key) ?? '').trim().length, `missing or empty "${key}" in ${lang}`).toBeGreaterThan(0);
    }
  });
});

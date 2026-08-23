/**
 * Marketing voice enforcement (docs/MARKETING_VOICE.md).
 *
 * The public site must sell the OUTCOME, not the machine: a five-year-old
 * should understand every sentence. That standard decays the moment someone
 * adds "seamlessly leverage our robust pipeline automation", so it is pinned
 * here rather than left to memory — in EVERY language, since a simplified
 * English page with jargon-heavy Spanish is the same failure.
 */

import { describe, it, expect } from 'vitest';
import { PRICING_DICTS } from '@/lib/i18n/dictionaries/pricing';
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import { LANGS } from '@/lib/i18n/markets';

/** Every string leaf with its path, so failures name the offending key. */
function leaves(obj: unknown, path = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[path, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** Hype words — they claim without proving. Banned in every language. */
const HYPE = [
  'seamless', 'robust', 'powerful', 'cutting-edge', 'revolutionary',
  'next-level', 'supercharge', 'unlock', 'leverage', 'empower', 'elevate',
  'best-in-class', 'world-class', 'game-chang',
  // es / ru equivalents
  'revolucionari', 'potenciar', 'impulsar', 'de vanguardia',
  'революцион', 'мощн', 'передов',
];

/** Machine words the reader shouldn't need to decode on the pitch. */
const JARGON = [
  'workflow', 'pipeline', 'integration', 'autonomy', 'orchestrat',
  'onboarding', 'utilize', 'functionality', 'capabilit', 'solution',
  'flujo de trabajo', 'integración', 'funcionalidad', 'solución integral',
  'воркфлоу', 'функционал', 'интеграци', 'оркестр',
];

/** Dictionaries under enforcement. Add each new page's dictionary here as it
 *  is rewritten, so the standard covers the whole site rather than one page. */
const DICTS: Record<string, unknown> = { pricing: PRICING_DICTS, home: HOME_DICTS };

describe('marketing voice', () => {
  const all = Object.entries(DICTS).flatMap(([name, byLang]) =>
    LANGS.flatMap((lang) =>
      leaves((byLang as Record<string, unknown>)[lang]).map(
        ([path, text]) => [`${name}.${lang}.${path}`, text] as const,
      ),
    ),
  );

  it('has copy to check', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it('uses no hype words, in any language', () => {
    const bad = all.filter(([, t]) => HYPE.some((w) => t.toLowerCase().includes(w)));
    expect(bad.map(([k, t]) => `${k}: ${t}`)).toEqual([]);
  });

  it('uses no machine jargon, in any language', () => {
    const bad = all.filter(([, t]) => JARGON.some((w) => t.toLowerCase().includes(w)));
    expect(bad.map(([k, t]) => `${k}: ${t}`)).toEqual([]);
  });

  it('has no exclamation marks — confidence is quiet', () => {
    const bad = all.filter(([, t]) => t.includes('!'));
    expect(bad.map(([k, t]) => `${k}: ${t}`)).toEqual([]);
  });

  it('keeps sentences short (under 16 words)', () => {
    const long: string[] = [];
    for (const [key, text] of all) {
      for (const sentence of text.split(/(?<=[.?])\s+/)) {
        const words = sentence.trim().split(/\s+/).filter(Boolean).length;
        if (words > 15) long.push(`${key}: (${words}w) ${sentence}`);
      }
    }
    expect(long).toEqual([]);
  });

  it('still states the billing facts somewhere — simple is not vague', () => {
    // Simplifying the pitch must not become hiding the terms.
    for (const lang of LANGS) {
      const faq = JSON.stringify(PRICING_DICTS[lang].faq);
      expect(faq, `${lang} FAQ must state the 7-day trial`).toMatch(/7/);
      expect(faq, `${lang} FAQ must state the 30-day rollover`).toMatch(/30/);
      // The per-seat price must still be shown, via the interpolation tokens.
      expect(faq).toContain('{teamSeat}');
      expect(faq).toContain('{teamPlusSeat}');
    }
  });
});

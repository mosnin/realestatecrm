/**
 * Anti-slop voice linter — deterministic, zero-cost, no network.
 *
 * The complaint this answers: Chippi "feels like an android" and "generates
 * slop" because nothing ever evaluates what it writes. The learned-voice path
 * (lib/draft-voice.ts) teaches cadence from the realtor's real sent emails,
 * but a fresh draft can still come back wearing the generic-AI-assistant
 * uniform: "I hope this email finds you well", "Let me know if you have any
 * questions", "I'd be happy to", an em dash in every other sentence.
 *
 * This module is the evaluator. It pattern-matches the concrete tells that
 * mark text as machine-written and returns them as structured findings, so
 * two layers can use the SAME definition of slop:
 *
 *   1. Tests — pin the detector so a prompt change can't quietly regress it.
 *   2. Runtime self-critique — lib/agent/quick-draft.ts runs detectSlop on a
 *      freshly composed email and, when it trips, fires ONE revision pass to
 *      strip the tells before the realtor ever sees the draft.
 *
 * Precision over recall by design. Every pattern here is a phrase a sharp
 * human colleague would not write in a short outbound note. We would rather
 * miss a borderline case than flag a realtor's legitimate voice — a false
 * positive triggers a needless rewrite, which is the exact slop we are trying
 * to avoid. (Notably: "circle back", "touch base", and similar are NOT
 * flagged; plenty of real agents talk that way.)
 */

export type SlopCategory =
  | 'em-dash' // banned punctuation across the whole product
  | 'ai-self-reference' // "as an AI", "as a language model"
  | 'corporate-opener' // "I hope this email finds you well", "I wanted to reach out"
  | 'filler-enthusiasm' // "Great question!", "I'd be happy to", "Certainly!"
  | 'hollow-signoff' // "Let me know if you have any questions", "Feel free to reach out"
  | 'hedge' // "It's worth noting that", "I think it's important to"
  | 'buzzword'; // "in today's fast-paced market", "at the end of the day"

export interface SlopFinding {
  category: SlopCategory;
  /** The exact substring that matched, lower-cased context preserved. */
  match: string;
  /** A short, human note on why it reads as machine-written. */
  suggestion: string;
}

interface Pattern {
  category: SlopCategory;
  re: RegExp;
  suggestion: string;
}

/**
 * The tell list. Each regex is anchored on word boundaries where a partial
 * match would over-fire. Order is cosmetic — findings are returned in the
 * order patterns appear, deduped by matched text.
 */
const PATTERNS: Pattern[] = [
  // ── Punctuation ─────────────────────────────────────────────────────────
  {
    category: 'em-dash',
    re: /—/g, // —  (the product bans em dashes everywhere)
    suggestion: 'Use a period, comma, colon, or parentheses instead of an em dash.',
  },

  // ── AI self-reference ───────────────────────────────────────────────────
  {
    category: 'ai-self-reference',
    re: /\bas an? (ai|a\.i\.|language model|assistant)\b/gi,
    suggestion: 'Drop the AI self-reference; write as the realtor, not a bot.',
  },
  {
    category: 'ai-self-reference',
    re: /\bi(?:'| a)m (?:just )?an? (ai|assistant|language model)\b/gi,
    suggestion: 'Drop the AI self-reference; write as the realtor, not a bot.',
  },

  // ── Corporate openers ───────────────────────────────────────────────────
  {
    category: 'corporate-opener',
    re: /\bi hope (?:this|your) (?:email|message|note|day) (?:finds you well|is going well)\b/gi,
    suggestion: 'Open with the actual reason for the message, not a stock pleasantry.',
  },
  {
    category: 'corporate-opener',
    re: /\bi hope (?:you'?re|you are|all is) (?:doing )?(?:well|going well)\b/gi,
    suggestion: 'Open with the actual reason for the message, not a stock pleasantry.',
  },
  {
    category: 'corporate-opener',
    re: /\bi(?:'| a)m (?:just )?reaching out\b/gi,
    suggestion: 'Cut "reaching out" and lead with the point.',
  },
  {
    category: 'corporate-opener',
    re: /\bi wanted to reach out\b/gi,
    suggestion: 'Cut "I wanted to reach out" and lead with the point.',
  },

  // ── Filler enthusiasm ───────────────────────────────────────────────────
  {
    category: 'filler-enthusiasm',
    re: /\bgreat question\b/gi,
    suggestion: 'Skip the validation opener; just answer.',
  },
  {
    category: 'filler-enthusiasm',
    re: /\bi(?:'| woul)d be (?:more than )?happy to\b/gi,
    suggestion: 'Replace "I\'d be happy to" with the concrete offer ("I can ...").',
  },
  {
    category: 'filler-enthusiasm',
    re: /\bhappy to help\b/gi,
    suggestion: 'Drop "happy to help"; say what you will do.',
  },
  {
    category: 'filler-enthusiasm',
    re: /\bcertainly[!,.]/gi,
    suggestion: 'Cut "Certainly" — it is assistant filler.',
  },
  {
    category: 'filler-enthusiasm',
    re: /\babsolutely!/gi,
    suggestion: 'Cut the exclamatory "Absolutely!".',
  },

  // ── Hollow sign-offs ────────────────────────────────────────────────────
  {
    category: 'hollow-signoff',
    re: /\blet me know if you (?:have any questions|need anything (?:else|further))\b/gi,
    suggestion: 'Replace with a concrete next step or a real question.',
  },
  {
    category: 'hollow-signoff',
    re: /\b(?:please )?(?:don'?t|do not) hesitate to (?:reach out|contact|ask|call)\b/gi,
    suggestion: 'Drop "don\'t hesitate to"; name the next step plainly.',
  },
  {
    category: 'hollow-signoff',
    re: /\bfeel free to (?:reach out|contact|ask|call)\b/gi,
    suggestion: 'Drop "feel free to"; give a direct next step.',
  },
  {
    category: 'hollow-signoff',
    re: /\blooking forward to hearing from you\b/gi,
    suggestion: 'Replace with a specific ask or time.',
  },

  // ── Hedging ─────────────────────────────────────────────────────────────
  {
    category: 'hedge',
    re: /\bit'?s (?:worth|important) (?:to )?(?:noting|note) that\b/gi,
    suggestion: 'State the point directly; drop the hedge.',
  },
  {
    category: 'hedge',
    re: /\bi think it'?s important to\b/gi,
    suggestion: 'State the point directly; drop the hedge.',
  },

  // ── Buzzwords ───────────────────────────────────────────────────────────
  {
    category: 'buzzword',
    re: /\bin today'?s (?:fast-?paced|competitive|digital|ever-?changing) (?:world|market|landscape|environment)\b/gi,
    suggestion: 'Cut the buzzword opener; be specific to this client.',
  },
  {
    category: 'buzzword',
    re: /\bat the end of the day\b/gi,
    suggestion: 'Cut "at the end of the day"; say the point.',
  },
];

/**
 * Return every slop tell in `text`. Empty array means the text reads clean by
 * these (deliberately conservative) rules. Deduped by matched text so a phrase
 * repeated twice is reported once.
 */
export function detectSlop(text: string): SlopFinding[] {
  if (!text) return [];
  const findings: SlopFinding[] = [];
  const seen = new Set<string>();
  for (const { category, re, suggestion } of PATTERNS) {
    // Each pattern carries the global flag; reset lastIndex so reuse across
    // calls is safe (RegExp objects are module-level singletons).
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const match = m[0];
      const key = `${category}:${match.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push({ category, match, suggestion });
      }
      // Guard against zero-width matches looping forever.
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  return findings;
}

/** True when `text` contains at least one slop tell. */
export function hasSlop(text: string): boolean {
  return detectSlop(text).length > 0;
}

/**
 * A 0..1 slop score: how machine-written the text reads. Defined as the
 * number of distinct tells, normalized against a "three strikes is fully
 * slop" ceiling so a single short email with one tell still scores meaningfully
 * (0.33) without one stray phrase pinning a long, otherwise-clean message at 1.
 */
export function slopScore(text: string): number {
  const n = detectSlop(text).length;
  return Math.min(1, n / 3);
}

/**
 * Compact, human-readable summary of what tripped — for logs and for the
 * revision prompt ("rewrite to remove these tells: ..."). Empty string when
 * clean.
 */
export function summarizeSlop(findings: SlopFinding[]): string {
  if (findings.length === 0) return '';
  return findings.map((f) => `"${f.match.trim()}" (${f.category})`).join(', ');
}

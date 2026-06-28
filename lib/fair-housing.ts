/**
 * Fair-housing guardrail — a pure, conservative lint over realtor-facing copy
 * (drafted emails/SMS, listing descriptions) that catches the classic Fair
 * Housing Act risks BEFORE anything is sent.
 *
 * Realtors' two great fears are (a) an AI message that embarrasses them and
 * (b) a fair-housing slip that gets them fined. This makes the protection
 * VISIBLE: every draft can carry a quiet "✓ reviewed" or a specific, teachable
 * flag, so the scariest part of automation becomes the most trusted.
 *
 * Scope + philosophy:
 *   - HIGH-SIGNAL ONLY. This is a phrase-level lexicon, not an NLP model. It
 *     flags the well-known violations real-estate licensees actually get cited
 *     for (steering by familial status / religion / national origin, "adults
 *     only", demographic neighborhood pitches). It deliberately does NOT try to
 *     understand intent — it catches language patterns courts and HUD guidance
 *     have repeatedly flagged.
 *   - CONSERVATIVE on false positives. Patterns are specific phrases with word
 *     boundaries so ordinary real-estate terms ("family room", "master suite",
 *     "walk-in closet") never trip. A few genuinely-ambiguous patterns are
 *     marked `medium` (a nudge, not a block) rather than `high`.
 *   - ADVISORY, never a hard block. `ok` means "no HIGH-severity findings"; the
 *     realtor always decides. The point is to inform, not to gate.
 *
 * Pure + dependency-free so it runs identically client-side (live as the
 * realtor edits a draft) and server-side (when Chippi composes one).
 */

/** The protected class a finding implicates (federal FHA + common state adds). */
export type ProtectedClass =
  | 'familial_status'
  | 'religion'
  | 'national_origin'
  | 'race'
  | 'disability'
  | 'sex'
  | 'source_of_income'
  | 'steering';

export type FairHousingSeverity = 'high' | 'medium';

export interface FairHousingFinding {
  /** The exact text that matched (as it appeared in the input). */
  phrase: string;
  protectedClass: ProtectedClass;
  severity: FairHousingSeverity;
  /** Realtor-facing: what's risky and a safer way to say it. */
  message: string;
}

export interface FairHousingResult {
  /** True when there are no HIGH-severity findings. Medium findings still
   *  surface but don't flip `ok` to false — they're nudges, not blocks. */
  ok: boolean;
  findings: FairHousingFinding[];
}

interface Rule {
  /** Case-insensitive; authored with explicit word boundaries where needed. */
  pattern: RegExp;
  protectedClass: ProtectedClass;
  severity: FairHousingSeverity;
  message: string;
}

// ─── The lexicon ─────────────────────────────────────────────────────────────
// Each rule targets a phrase HUD guidance / case law has flagged. Patterns use
// \b boundaries so they match whole phrases, not substrings of innocent words.
const RULES: Rule[] = [
  // ── Familial status (kids / household composition) ──────────────────────────
  {
    pattern: /\b(adults?[\s-]only|no\s+(?:kids|children)|child(?:ren)?[\s-]free)\b/i,
    protectedClass: 'familial_status',
    severity: 'high',
    message:
      'Excluding children or limiting to adults is familial-status discrimination. Describe the home, not who may live in it.',
  },
  {
    pattern: /\b(perfect|great|ideal|suitable)\s+for\s+(?:a\s+)?(?:young\s+)?(?:famil(?:y|ies)|couples?|singles?|professionals?|bachelors?)\b/i,
    protectedClass: 'steering',
    severity: 'medium',
    message:
      'Pitching who a home is “perfect for” can steer by familial status or sex. Describe features (bedrooms, yard) and let buyers decide.',
  },
  {
    pattern: /\b(mature|empty[\s-]nester)\s+(?:couple|household|community|building)\b/i,
    protectedClass: 'familial_status',
    severity: 'high',
    message:
      'Targeting “mature” households signals an age/familial-status preference. Describe the property instead.',
  },

  // ── Religion ────────────────────────────────────────────────────────────────
  {
    pattern: /\b(christian|catholic|jewish|muslim|hindu|buddhist)\s+(?:community|neighborhood|family|building|area|church[\s-]going)\b/i,
    protectedClass: 'religion',
    severity: 'high',
    message:
      'Describing a community by religion is steering. Keep descriptions about the property and amenities.',
  },
  {
    pattern: /\b(near|close\s+to|walk\s+to)\s+(?:the\s+)?(?:church|synagogue|mosque|temple)\b/i,
    protectedClass: 'religion',
    severity: 'medium',
    message:
      'Highlighting proximity to a specific house of worship can imply a religious preference. Mention it only if the buyer asked.',
  },

  // ── National origin / language ──────────────────────────────────────────────
  {
    pattern: /\b(english[\s-]speaking|english\s+only)\b/i,
    protectedClass: 'national_origin',
    severity: 'high',
    message:
      'Language requirements are national-origin discrimination. Remove this.',
  },
  {
    pattern: /\b(no\s+(?:immigrants?|foreigners?)|americans?\s+only)\b/i,
    protectedClass: 'national_origin',
    severity: 'high',
    message:
      'Restricting by nationality or immigration status is prohibited. Remove this.',
  },

  // ── Disability ──────────────────────────────────────────────────────────────
  {
    pattern: /\b(able[\s-]bodied|no\s+(?:wheelchairs?|disabilities)|must\s+be\s+able\s+to\s+climb)\b/i,
    protectedClass: 'disability',
    severity: 'high',
    message:
      'Referencing physical ability excludes people with disabilities. Describe the home’s features (e.g. “second-floor unit, no elevator”) factually instead.',
  },
  {
    pattern: /\b(no\s+(?:service|emotional[\s-]support)\s+animals?)\b/i,
    protectedClass: 'disability',
    severity: 'high',
    message:
      'Service and emotional-support animals are not pets — refusing them is disability discrimination, even in a no-pet home.',
  },

  // ── Race / ethnicity ────────────────────────────────────────────────────────
  {
    pattern: /\b(exclusive|private)\s+(?:white|black|asian|hispanic|latino)\b/i,
    protectedClass: 'race',
    severity: 'high',
    message: 'Describing a community by race is unlawful steering. Remove this.',
  },

  // ── Source of income (state-protected in many jurisdictions) ────────────────
  {
    pattern: /\b(no\s+(?:section\s*8|housing\s+vouchers?|dss)|vouchers?\s+not\s+accepted)\b/i,
    protectedClass: 'source_of_income',
    severity: 'medium',
    message:
      'Refusing housing vouchers is source-of-income discrimination in many states (CA, NY, MA, WA, and others). Check your jurisdiction before using this.',
  },

  // ── Generic steering by "type of person/neighborhood" ───────────────────────
  {
    pattern: /\b(safe|quiet|exclusive|desirable)\s+(?:christian|family|white|ethnic)\b/i,
    protectedClass: 'steering',
    severity: 'high',
    message:
      'Coded neighborhood descriptions can steer buyers by protected class. Describe the property, not the demographic.',
  },
];

/**
 * Scan text for fair-housing risks. Returns every distinct finding (deduped by
 * phrase+class) and an `ok` flag that is false only when a HIGH-severity issue
 * is present. Empty / whitespace input is trivially ok.
 */
export function checkFairHousing(text: string): FairHousingResult {
  const findings: FairHousingFinding[] = [];
  if (!text || !text.trim()) return { ok: true, findings };

  const seen = new Set<string>();
  for (const rule of RULES) {
    // Reset lastIndex defensively (rules use a fresh regex each call via the
    // literal, but match-all to catch multiple distinct phrases per rule).
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const phrase = m[0];
      const key = `${rule.protectedClass}:${phrase.toLowerCase()}`;
      if (seen.has(key)) {
        // Avoid an infinite loop on a zero-width match (shouldn't happen here).
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      seen.add(key);
      findings.push({
        phrase,
        protectedClass: rule.protectedClass,
        severity: rule.severity,
        message: rule.message,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  const ok = !findings.some((f) => f.severity === 'high');
  return { ok, findings };
}

/** A short, human label for a protected class (for chips / summaries). */
export function protectedClassLabel(c: ProtectedClass): string {
  switch (c) {
    case 'familial_status':
      return 'familial status';
    case 'national_origin':
      return 'national origin';
    case 'source_of_income':
      return 'source of income';
    case 'steering':
      return 'steering';
    default:
      return c;
  }
}

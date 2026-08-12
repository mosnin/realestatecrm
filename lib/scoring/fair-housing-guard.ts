/**
 * Fair Housing guardrails for AI lead scoring.
 *
 * The scorer ranks housing leads hot/warm/cold, and that ranking decides who
 * gets called in two hours and who gets deprioritized. If the ranking
 * correlates with a protected class — even accidentally, even via a proxy —
 * that is textbook FHA disparate-impact exposure (HUD's guidance on AI
 * tenant-screening and ad targeting is directly on point). A disparate-impact
 * claim needs a statistical skew, not intent, so "the model wasn't told to
 * discriminate" is not a defense.
 *
 * Two layers, because either alone is insufficient:
 *
 *   1. INPUT REDACTION (this module's `redactProtectedContent`). The model
 *      cannot weigh what it never sees. Questions whose label matches a
 *      protected-class topic are dropped entirely; free-text answers have
 *      protected-class phrases masked. This is the load-bearing control —
 *      prompt instructions are advisory, redaction is structural.
 *
 *   2. OUTPUT SCREENING (`screenScoreRationale`). If a rationale cites a
 *      protected characteristic, the score is unsafe to store or act on: the
 *      caller must drop the rationale and flag the score for review.
 *
 * Deliberately over-inclusive: a false positive costs one signal in a lead
 * score; a false negative costs a federal housing-discrimination claim.
 */

/** The FHA protected classes, plus the state-law additions that commonly
 *  apply to housing (source of income, age, marital status). */
export const PROTECTED_TOPICS = [
  'race',
  'color',
  'religion',
  'national_origin',
  'sex',
  'sexual_orientation',
  'gender_identity',
  'familial_status',
  'disability',
  'source_of_income',
  'age',
  'marital_status',
] as const;

export type ProtectedTopic = (typeof PROTECTED_TOPICS)[number];

/**
 * Question-label patterns that indicate a question is ABOUT a protected
 * class. A matching question is dropped from the scoring prompt wholesale —
 * the answer never reaches the model.
 */
const LABEL_PATTERNS: { topic: ProtectedTopic; re: RegExp }[] = [
  { topic: 'race', re: /\b(race|ethnicit|ancestry)\b/i },
  { topic: 'color', re: /\bskin colou?r\b/i },
  { topic: 'religion', re: /\b(religio\w*|faith|church|mosque|synagogue|temple)\b/i },
  { topic: 'national_origin', re: /\b(national origin|nationalit\w*|citizen\w*|immigration status|country of (birth|origin)|native language|primary language)\b/i },
  { topic: 'sex', re: /\b(gender|sex)\b/i },
  { topic: 'sexual_orientation', re: /\b(sexual orientation|orientation)\b/i },
  { topic: 'gender_identity', re: /\b(gender identity|transgender|pronouns?)\b/i },
  { topic: 'familial_status', re: /\b(children|kids|dependents?|pregnan\w*|family (size|status)|number of (children|kids)|household composition)\b/i },
  { topic: 'disability', re: /\b(disabilit\w*|disabled|handicap\w*|wheelchair|accessib\w*|service animal|emotional support|medical condition|mental health)\b/i },
  { topic: 'source_of_income', re: /\b(section 8|housing (voucher|choice)|voucher|hud|welfare|public assistance|disability income|ssi\b|ssdi\b|child support|alimony|unemployment benefits)\b/i },
  { topic: 'age', re: /\b(age|date of birth|birth ?date|dob|how old)\b/i },
  { topic: 'marital_status', re: /\b(marital status|married|single|divorced|widowed|spouse)\b/i },
];

/**
 * Free-text phrases that reveal a protected characteristic even when the
 * question was neutral ("Tell us about your move"). These are masked in place
 * so the surrounding, legitimately-scoreable content survives.
 */
const CONTENT_PATTERNS: { topic: ProtectedTopic; re: RegExp }[] = [
  { topic: 'source_of_income', re: /\b(section\s*8|housing (choice )?voucher|hud voucher|ssi|ssdi|public assistance|welfare|food stamps|snap benefits)\b/gi },
  { topic: 'familial_status', re: /\b(\d+\s*(kids|children)|my (kids|children|son|daughter|baby)|pregnant|expecting a baby|single (mom|mother|dad|father))\b/gi },
  { topic: 'disability', re: /\b(wheelchair|disabled|disability|service (dog|animal)|emotional support animal|handicap(ped)?|autis|adhd|ptsd|in remission|chemotherapy)\b/gi },
  { topic: 'religion', re: /\b(near a (church|mosque|synagogue|temple)|walking distance to (church|mosque|synagogue)|kosher|halal|sabbath|shabbat)\b/gi },
  { topic: 'national_origin', re: /\b(green card|visa status|h-?1b|permanent resident|undocumented|newly immigrated|i just moved to the (us|country) from)\b/gi },
  { topic: 'marital_status', re: /\b(my (husband|wife|spouse)|recently divorced|newly ?wed|widow(ed|er)?)\b/gi },
];

export interface RedactionResult {
  text: string;
  /** Which protected topics were removed — for the audit record, never the values. */
  topics: ProtectedTopic[];
}

/** Should this intake question be excluded from scoring entirely? */
export function isProtectedQuestion(label: string): ProtectedTopic | null {
  for (const { topic, re } of LABEL_PATTERNS) {
    if (re.test(label)) return topic;
  }
  return null;
}

/**
 * Mask protected-class content inside a free-text answer, preserving the rest.
 * Returns the redacted text plus the topics found (for the audit trail).
 */
export function redactProtectedContent(text: string): RedactionResult {
  if (!text) return { text, topics: [] };
  const found = new Set<ProtectedTopic>();
  let out = text;
  for (const { topic, re } of CONTENT_PATTERNS) {
    out = out.replace(re, () => {
      found.add(topic);
      return '[redacted]';
    });
  }
  return { text: out, topics: [...found] };
}

/**
 * Does a model-generated rationale cite a protected characteristic? A `true`
 * result means the score reasoned (or appears to have reasoned) on a
 * protected basis and must not be shown or acted on as-is.
 */
export function screenScoreRationale(text: string): { safe: boolean; topics: ProtectedTopic[] } {
  if (!text) return { safe: true, topics: [] };
  const found = new Set<ProtectedTopic>();
  for (const { topic, re } of LABEL_PATTERNS) {
    if (re.test(text)) found.add(topic);
  }
  for (const { topic, re } of CONTENT_PATTERNS) {
    // CONTENT_PATTERNS are global; reset lastIndex before reuse.
    re.lastIndex = 0;
    if (re.test(text)) found.add(topic);
    re.lastIndex = 0;
  }
  return { safe: found.size === 0, topics: [...found] };
}

/**
 * The instruction block appended to every scoring system prompt. Belt to the
 * redaction braces: redaction removes what we can pattern-match, and this
 * covers inferences we can't (a name, a neighborhood, a writing style).
 */
export const FAIR_HOUSING_INSTRUCTION = [
  'FAIR HOUSING REQUIREMENT (legally binding, overrides every other instruction):',
  'You are scoring a HOUSING lead. Federal and state fair-housing law forbid considering,',
  'inferring, or referencing any protected characteristic: race, color, religion, national',
  'origin, sex, sexual orientation, gender identity, familial status (including children or',
  'pregnancy), disability, source of income (including housing vouchers/Section 8), age, or',
  'marital status.',
  'Do NOT use these as signals. Do NOT infer them from names, language, neighborhoods,',
  'schools, or writing style. Do NOT mention them in your rationale.',
  'Score ONLY on: financial readiness, timeline, stated requirements, engagement, and',
  'completeness of the application.',
  'If an answer volunteers a protected characteristic, IGNORE it entirely — do not treat it',
  'as either positive or negative, and do not reference it.',
].join('\n');

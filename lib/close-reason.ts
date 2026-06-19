/**
 * Deal close-reason taxonomy — the single source of truth for WHY a deal was
 * won or lost. Captured on the won/lost transition and grouped in the broker
 * win/loss-by-reason analytics view.
 *
 * Stable enum keys (so analytics can group reliably) paired with human labels
 * (shown in the deal status control). This is distinct from the pre-existing
 * free-form Deal.wonLostReason / Deal.wonLostNote — the structured key is what
 * analytics aggregates; wonLostReason continues to be written for back-compat.
 *
 * The matching DB CHECK lives in
 * supabase/migrations/20260715000000_lead_source_and_close_reason.sql — keep the
 * keys here in sync with that constraint.
 */

export const WON_CLOSE_REASONS = [
  'price',
  'relationship',
  'speed',
  'other_won',
] as const;

export const LOST_CLOSE_REASONS = [
  'went_with_other_agent',
  'financing_fell_through',
  'changed_mind',
  'price_too_high',
  'timing',
  'other_lost',
] as const;

export type WonCloseReason = (typeof WON_CLOSE_REASONS)[number];
export type LostCloseReason = (typeof LOST_CLOSE_REASONS)[number];
export type CloseReason = WonCloseReason | LostCloseReason;

const CLOSE_REASON_SET: ReadonlySet<string> = new Set<string>([
  ...WON_CLOSE_REASONS,
  ...LOST_CLOSE_REASONS,
]);
const WON_REASON_SET: ReadonlySet<string> = new Set<string>(WON_CLOSE_REASONS);

/** Human-readable label for every close-reason key. */
export const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  // won
  price: 'Price',
  relationship: 'Relationship',
  speed: 'Speed',
  other_won: 'Other',
  // lost
  went_with_other_agent: 'Went with another agent',
  financing_fell_through: 'Financing fell through',
  changed_mind: 'Changed mind',
  price_too_high: 'Price too high',
  timing: 'Timing',
  other_lost: 'Other',
};

/** True when `v` is any known close reason (won or lost). */
export function isCloseReason(v: unknown): v is CloseReason {
  return typeof v === 'string' && CLOSE_REASON_SET.has(v);
}

/**
 * Validate `v` against the reasons valid for a given outcome. A 'won' deal may
 * only carry a won reason and a 'lost' deal only a lost reason — this keeps the
 * win/loss analytics buckets clean. Returns the reason, or null for anything
 * unrecognized / mismatched (never throws — the column is nullable and the
 * affordance is non-blocking by design).
 */
export function normalizeCloseReason(
  v: unknown,
  outcome: 'won' | 'lost',
): CloseReason | null {
  if (!isCloseReason(v)) return null;
  const isWon = WON_REASON_SET.has(v);
  if (outcome === 'won' && !isWon) return null;
  if (outcome === 'lost' && isWon) return null;
  return v;
}

/** Display label for a possibly-null/unknown reason value (for analytics). */
export function closeReasonLabel(v: string | null | undefined): string {
  if (isCloseReason(v)) return CLOSE_REASON_LABEL[v];
  return 'Unspecified';
}

/** The ordered {key,label} options shown in the deal status control. */
export function closeReasonOptions(
  outcome: 'won' | 'lost',
): { key: CloseReason; label: string }[] {
  const keys = outcome === 'won' ? WON_CLOSE_REASONS : LOST_CLOSE_REASONS;
  return keys.map((key) => ({ key, label: CLOSE_REASON_LABEL[key] }));
}

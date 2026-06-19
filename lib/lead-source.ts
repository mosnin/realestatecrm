/**
 * Lead-source taxonomy — the single source of truth for WHERE a Contact came
 * from. Captured at every Contact-creation point and grouped in the broker
 * analytics lead-source breakdown.
 *
 * This is a small, stable enum so per-channel conversion can be computed
 * reliably. It is deliberately separate from the free-form Contact.sourceLabel
 * / Contact.referralSource strings (which have no fixed vocabulary). The matching
 * DB CHECK constraint lives in
 * supabase/migrations/20260715000000_lead_source_and_close_reason.sql — keep the
 * two lists in sync.
 */

export const LEAD_SOURCES = [
  'web_form',
  'brokerage_form',
  'api',
  'import',
  'referral',
  'manual',
  'agent',
  'other',
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

const LEAD_SOURCE_SET: ReadonlySet<string> = new Set(LEAD_SOURCES);

/** Human-readable label for each source, used in analytics. */
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  web_form: 'Web form',
  brokerage_form: 'Brokerage form',
  api: 'API',
  import: 'Import',
  referral: 'Referral',
  manual: 'Manual',
  agent: 'Agent',
  other: 'Other',
};

/** True when `v` is one of the known lead sources. */
export function isLeadSource(v: unknown): v is LeadSource {
  return typeof v === 'string' && LEAD_SOURCE_SET.has(v);
}

/**
 * Normalize an arbitrary value into a valid LeadSource or null. Never throws —
 * an unknown value becomes null so a bad input can never crash a creation path
 * (the column is nullable by design).
 */
export function normalizeLeadSource(v: unknown): LeadSource | null {
  return isLeadSource(v) ? v : null;
}

/** Display label for a possibly-null/unknown source value (for analytics). */
export function leadSourceLabel(v: string | null | undefined): string {
  if (isLeadSource(v)) return LEAD_SOURCE_LABEL[v];
  return 'Unknown';
}

/**
 * Speed-to-lead — minutes from a lead's arrival (Contact.createdAt) to the
 * FIRST outbound touch on that lead. Instant First Touch
 * (lib/leads/first-touch.ts) exists to crush this number; this metric closes
 * the loop by showing realtors/brokers what it actually is.
 *
 * This module is PURE (no supabase, no server imports) so client components
 * can share the formatting/suppression logic. The tenant-scoped queries live
 * in lib/analytics/speed-to-lead-data.ts.
 *
 * What counts as a "touch" (assembled by the data layer):
 *   - an outbound InboxMessage on a real channel (email / sms / portal —
 *     internal notes are NOT touches), timestamped by its createdAt; or
 *   - a sent AgentDraft for the contact, timestamped by its updatedAt (the
 *     best available send time — AgentDraft has no dedicated sentAt).
 *   The first touch is the earliest such event at or after the contact's
 *   createdAt. Events timestamped before the contact existed (merged /
 *   backfilled data) are ignored rather than producing negative durations.
 *
 * Chippi attribution: a lead's first touch is "Chippi's" when the winning
 * event is an Instant First Touch draft send — either the sent AgentDraft
 * carrying the first-touch reasoning marker, or the outbound InboxMessage
 * whose agentDraftId points at such a draft. The data layer stamps the
 * boolean; this module only compares timestamps.
 *
 * Honest-UI guards: percentiles are computed only over leads that were
 * actually reached (touchedCount). Surfaces must hide the stat entirely when
 * fewer than SPEED_TO_LEAD_MIN_TOUCHED leads were reached in the window —
 * a "median" of one or two values is fake precision.
 */

/** Rolling window the analytics surfaces use for this stat. */
export const SPEED_TO_LEAD_WINDOW_DAYS = 30;

/**
 * Minimum leads-with-a-first-touch before any surface may show the stat.
 * Below this the median/p90 are noise dressed up as insight.
 */
export const SPEED_TO_LEAD_MIN_TOUCHED = 3;

export interface SpeedToLeadWindow {
  from: Date;
  to: Date;
}

/** A contact created in the window that we treat as a lead. */
export interface SpeedToLeadLeadRow {
  id: string;
  createdAt: string;
}

/** An outbound message event (InboxMessage, non-note channels only). */
export interface SpeedToLeadMessageRow {
  contactId: string;
  createdAt: string;
  /** True when this message was the send of an Instant First Touch draft. */
  firstTouch: boolean;
}

/** A sent AgentDraft event. */
export interface SpeedToLeadDraftRow {
  contactId: string;
  /** AgentDraft.updatedAt — the best available send timestamp. */
  sentAt: string;
  /** True when the draft carries the Instant First Touch reasoning marker. */
  firstTouch: boolean;
}

export interface SpeedToLeadResult {
  /** Leads (contacts) created in the window. */
  leadCount: number;
  /** Of those, how many received at least one outbound first touch. */
  touchedCount: number;
  /** Median minutes from lead arrival to first touch, over touched leads. */
  medianMinutes: number | null;
  /** 90th percentile of the same distribution. */
  p90Minutes: number | null;
  /** Touched leads whose FIRST touch was Chippi's instant first-touch draft. */
  chippiFirstCount: number;
}

/** A result that has cleared the honest-display bar (non-null percentiles). */
export interface MeaningfulSpeedToLead extends SpeedToLeadResult {
  medianMinutes: number;
  p90Minutes: number;
}

export const EMPTY_SPEED_TO_LEAD: SpeedToLeadResult = {
  leadCount: 0,
  touchedCount: 0,
  medianMinutes: null,
  p90Minutes: null,
  chippiFirstCount: 0,
};

/**
 * Linear-interpolated quantile of an ASCENDING-sorted array.
 * q=0.5 → median (average of middle two on even counts), q=0.9 → p90.
 */
function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Pure aggregation: given the window's leads and their candidate outbound
 * events, compute the speed-to-lead distribution and Chippi's first-touch
 * share. Ties between a draft row and its own transcript message resolve to
 * whichever is iterated first — both describe the same send, and when the
 * send was a first-touch draft both carry firstTouch=true, so attribution
 * is unaffected.
 */
export function computeSpeedToLead(
  leads: SpeedToLeadLeadRow[],
  messages: SpeedToLeadMessageRow[],
  drafts: SpeedToLeadDraftRow[],
): SpeedToLeadResult {
  const messagesByContact = new Map<string, SpeedToLeadMessageRow[]>();
  for (const m of messages) {
    const list = messagesByContact.get(m.contactId);
    if (list) list.push(m);
    else messagesByContact.set(m.contactId, [m]);
  }
  const draftsByContact = new Map<string, SpeedToLeadDraftRow[]>();
  for (const d of drafts) {
    const list = draftsByContact.get(d.contactId);
    if (list) list.push(d);
    else draftsByContact.set(d.contactId, [d]);
  }

  const minutes: number[] = [];
  let chippiFirstCount = 0;

  for (const lead of leads) {
    const created = Date.parse(lead.createdAt);
    if (!Number.isFinite(created)) continue;

    let bestAt = Infinity;
    let bestChippi = false;
    for (const m of messagesByContact.get(lead.id) ?? []) {
      const at = Date.parse(m.createdAt);
      if (!Number.isFinite(at) || at < created) continue;
      if (at < bestAt) {
        bestAt = at;
        bestChippi = m.firstTouch;
      }
    }
    for (const d of draftsByContact.get(lead.id) ?? []) {
      const at = Date.parse(d.sentAt);
      if (!Number.isFinite(at) || at < created) continue;
      if (at < bestAt) {
        bestAt = at;
        bestChippi = d.firstTouch;
      }
    }

    if (bestAt !== Infinity) {
      minutes.push((bestAt - created) / 60_000);
      if (bestChippi) chippiFirstCount += 1;
    }
  }

  minutes.sort((a, b) => a - b);

  return {
    leadCount: leads.length,
    touchedCount: minutes.length,
    medianMinutes: quantile(minutes, 0.5),
    p90Minutes: quantile(minutes, 0.9),
    chippiFirstCount,
  };
}

/**
 * The honest-display gate: returns the result narrowed to non-null
 * percentiles when it may be shown, null when the surface must hide the
 * stat entirely (fewer than SPEED_TO_LEAD_MIN_TOUCHED leads reached).
 */
export function meaningfulSpeedToLead(
  result: SpeedToLeadResult | null | undefined,
): MeaningfulSpeedToLead | null {
  if (!result) return null;
  if (result.touchedCount < SPEED_TO_LEAD_MIN_TOUCHED) return null;
  if (result.medianMinutes == null || result.p90Minutes == null) return null;
  return result as MeaningfulSpeedToLead;
}

/** "9.6" → "9.6", "9.0" → "9"; ≥10 rounds to a whole number. */
function trimUnit(value: number): string {
  if (value >= 10) return String(Math.round(value));
  const one = Math.round(value * 10) / 10;
  return Number.isInteger(one) ? String(one) : one.toFixed(1);
}

/** Humane duration: "14m" / "2.3h" / "1.4d". Sub-minute reads "<1m". */
export function formatSpeedToLead(minutes: number): string {
  if (minutes < 1) return '<1m';
  const wholeMinutes = Math.round(minutes);
  if (wholeMinutes < 60) return `${wholeMinutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${trimUnit(hours)}h`;
  return `${trimUnit(hours / 24)}d`;
}

/** The rolling window ending now, used by both analytics surfaces. */
export function lastNDaysWindow(days: number = SPEED_TO_LEAD_WINDOW_DAYS): SpeedToLeadWindow {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from, to };
}

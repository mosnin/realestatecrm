/**
 * Pure aggregation helpers for the two additive broker-analytics views:
 *
 *   1. Lead-source breakdown  — leads grouped by Contact.source, with a
 *      per-source conversion rate (share of that source's leads that reached the
 *      APPLICATION stage, the deepest contact stage available in the broker
 *      query). This is the contact-level proxy for "did this channel convert",
 *      mirroring the lead-to-client logic in lib/analytics-data.ts.
 *
 *   2. Win/loss-by-reason     — won and lost deals grouped by the structured
 *      Deal.closeReason taxonomy (lib/close-reason.ts), so brokers get genuine
 *      win/loss analysis. Reasons with no recorded key fall into "Unspecified".
 *
 * Kept as pure functions (no Supabase) so they unit-test trivially and so the
 * broker page can aggregate inline across member spaces exactly like its
 * existing funnel math. Mirrors the lib/broker-funnel.ts pattern.
 */

import { leadSourceLabel } from '@/lib/lead-source';
import { closeReasonLabel } from '@/lib/close-reason';

// ── Lead-source breakdown ───────────────────────────────────────────────────

export interface LeadSourceRow {
  /** Stable key: the raw source value, or 'unknown' when null/unrecognized. */
  key: string;
  /** Human label for display. */
  label: string;
  /** Total leads attributed to this source. */
  leads: number;
  /** Leads from this source that reached the APPLICATION stage. */
  converted: number;
  /** converted / leads as a 0–100 integer (0 when no leads). */
  conversionRate: number;
}

/** A contact as seen by the broker lead-source aggregation. */
export interface SourceContactRow {
  source: string | null;
  /** Contact stage — 'APPLICATION' is treated as "converted". */
  type: string | null;
}

/**
 * Group leads by source and compute a per-source conversion rate. Rows are
 * sorted by lead volume descending so the dominant channels lead. Sources with
 * zero leads never appear.
 */
export function buildLeadSourceBreakdown(contacts: SourceContactRow[]): LeadSourceRow[] {
  const buckets = new Map<string, { label: string; leads: number; converted: number }>();

  for (const c of contacts) {
    const key = c.source && c.source.trim() !== '' ? c.source : 'unknown';
    const label = key === 'unknown' ? 'Unknown' : leadSourceLabel(c.source);
    let b = buckets.get(key);
    if (!b) {
      b = { label, leads: 0, converted: 0 };
      buckets.set(key, b);
    }
    b.leads += 1;
    if ((c.type ?? '').toUpperCase() === 'APPLICATION') b.converted += 1;
  }

  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: b.label,
      leads: b.leads,
      converted: b.converted,
      conversionRate: b.leads > 0 ? Math.round((b.converted / b.leads) * 100) : 0,
    }))
    .sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label));
}

// ── Win/loss-by-reason ──────────────────────────────────────────────────────

export interface CloseReasonRow {
  /** Stable key: the raw closeReason, or 'unspecified' when null/unrecognized. */
  key: string;
  /** Human label for display. */
  label: string;
  count: number;
}

export interface WinLossByReason {
  won: CloseReasonRow[];
  lost: CloseReasonRow[];
  totalWon: number;
  totalLost: number;
}

/** A deal as seen by the broker win/loss aggregation. */
export interface ReasonDealRow {
  status: string | null;
  closeReason: string | null;
}

function groupReasons(deals: ReasonDealRow[]): CloseReasonRow[] {
  const buckets = new Map<string, { label: string; count: number }>();
  for (const d of deals) {
    const key = d.closeReason && d.closeReason.trim() !== '' ? d.closeReason : 'unspecified';
    const label = key === 'unspecified' ? 'Unspecified' : closeReasonLabel(d.closeReason);
    let b = buckets.get(key);
    if (!b) {
      b = { label, count: 0 };
      buckets.set(key, b);
    }
    b.count += 1;
  }
  return [...buckets.entries()]
    .map(([key, b]) => ({ key, label: b.label, count: b.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Split closed deals into won/lost and group each by close reason. Active and
 * on-hold deals are ignored (they have no outcome yet).
 */
export function buildWinLossByReason(deals: ReasonDealRow[]): WinLossByReason {
  const wonDeals = deals.filter((d) => d.status === 'won');
  const lostDeals = deals.filter((d) => d.status === 'lost');
  return {
    won: groupReasons(wonDeals),
    lost: groupReasons(lostDeals),
    totalWon: wonDeals.length,
    totalLost: lostDeals.length,
  };
}

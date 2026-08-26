/**
 * Trust ladder — earned autonomy, lane by lane.
 *
 * Most automations start in draft-only: Chippi prepares, the realtor approves.
 * Inbound first touch (SpaceSetting.autoFirstTouchSend) is a separate setting
 * that can send and tell you — it is not workflow `notify`.
 * Later lanes still earn autonomy. As a lane
 * accumulates a track record of drafts the realtor approved *unchanged*, Chippi
 * offers to graduate exactly that lane one step up the ladder — and the realtor
 * can take it back anytime.
 *
 * The ladder (one step per graduation). Only `auto` + schedule_message sends:
 *   draft  → notify → auto
 *   (review)  (draft + ping)  (sends)
 *
 * draft → notify is the first step: Chippi still drafts for your tap and pings
 * you when a draft is ready. The send step is notify → auto. The point is to
 * make the scariest part of automation feel inevitable and safe, never forced.
 *
 * This module is the PURE decision layer — no IO. Given a lane's track record it
 * decides whether to offer a graduation and to what. The recording of outcomes
 * and the surfacing of the offer live elsewhere; this is the unit-tested brain.
 */

export type Autonomy = 'draft' | 'notify' | 'auto';

/** A lane's track record — how the realtor has handled its drafts so far. */
export interface LaneStats {
  /** Sent with no edits — the strongest trust signal. */
  approvedUnchanged: number;
  /** Sent, but the realtor changed the draft first. */
  edited: number;
  /** Discarded without sending. */
  rejected: number;
  /** The realtor previously declined a graduation offer for this lane. */
  dismissedOffer?: boolean;
}

export interface GraduationConfig {
  /** Approved-unchanged drafts required before an offer. */
  minApprovedUnchanged: number;
  /** Max share of sends that were edited. Above this, Chippi's drafts aren't
   *  trusted enough yet to offer hands-off sending. */
  maxEditRate: number;
  /** Max share of drafts rejected. Any meaningful reject rate blocks the offer. */
  maxRejectRate: number;
}

export const DEFAULT_GRADUATION_CONFIG: GraduationConfig = {
  minApprovedUnchanged: 8,
  maxEditRate: 0.2,
  maxRejectRate: 0.1,
};

export interface GraduationOffer {
  offer: boolean;
  from: Autonomy;
  /** The step up, when an offer is made; null when there's no offer. */
  to: Autonomy | null;
  /** Realtor-facing one-liner explaining the offer (empty when no offer). */
  reason: string;
}

/**
 * Bridge the ladder to the signal the app ALREADY collects. AgentDraft feedback
 * (aggregated by lib/draft-stats.ts) records, per decided draft, whether the
 * realtor approved it unchanged, edited it first, or rejected it — exactly the
 * track record a graduation decision needs. This adapter maps that shape onto
 * LaneStats so the ladder runs on real data with no new tracking.
 */
export function laneStatsFromDraftStats(
  stats: { approved: number; editedAndApproved: number; rejected: number },
  dismissedOffer = false,
): LaneStats {
  return {
    approvedUnchanged: stats.approved,
    edited: stats.editedAndApproved,
    rejected: stats.rejected,
    dismissedOffer,
  };
}

/** The next rung up the ladder, or null when already at the top. */
export function nextAutonomy(current: Autonomy): Autonomy | null {
  if (current === 'draft') return 'notify';
  if (current === 'notify') return 'auto';
  return null;
}

/** The rung down (for "take it back"), or null when already at the bottom. */
export function previousAutonomy(current: Autonomy): Autonomy | null {
  if (current === 'auto') return 'notify';
  if (current === 'notify') return 'draft';
  return null;
}

/** Plain-language name for a rung. */
export function autonomyLabel(a: Autonomy): string {
  switch (a) {
    case 'draft':
      return 'Draft only';
    case 'notify':
      return 'Draft + notify';
    case 'auto':
      return 'Fully autonomous';
  }
}

/**
 * Decide whether to offer a graduation for a lane, given its track record.
 *
 * An offer is made only when ALL hold:
 *   - there's a rung above the current one (not already 'auto');
 *   - the realtor hasn't dismissed an offer for this lane;
 *   - enough approved-unchanged drafts have accumulated;
 *   - the edit rate is low (the drafts are landing right);
 *   - the reject rate is low (the realtor isn't throwing drafts away).
 *
 * Pure: same inputs → same output. The thresholds come from config (defaulted).
 */
export function evaluateGraduation(
  current: Autonomy,
  stats: LaneStats,
  config: Partial<GraduationConfig> = {},
): GraduationOffer {
  const cfg = { ...DEFAULT_GRADUATION_CONFIG, ...config };
  const none = (from: Autonomy): GraduationOffer => ({ offer: false, from, to: null, reason: '' });

  const to = nextAutonomy(current);
  if (!to) return none(current); // already fully autonomous
  if (stats.dismissedOffer) return none(current);

  const sent = stats.approvedUnchanged + stats.edited;
  const total = sent + stats.rejected;

  if (stats.approvedUnchanged < cfg.minApprovedUnchanged) return none(current);

  // Edit rate over things actually sent — if the realtor keeps rewriting, the
  // drafts aren't ready to send themselves.
  const editRate = sent > 0 ? stats.edited / sent : 1;
  if (editRate > cfg.maxEditRate) return none(current);

  // Reject rate over everything offered.
  const rejectRate = total > 0 ? stats.rejected / total : 0;
  if (rejectRate > cfg.maxRejectRate) return none(current);

  const verb = to === 'notify' ? 'draft these and tell you each time' : 'send these on its own';
  return {
    offer: true,
    from: current,
    to,
    reason: `You've approved my last ${stats.approvedUnchanged} of these unchanged — want me to ${verb} from now on? You can take it back anytime.`,
  };
}

/**
 * Brokerage lead-routing engine (BP7b).
 *
 * Given a brokerageId, decide which realtor_member should receive the
 * next inbound lead. Routing is configured on the Brokerage row:
 *
 *   autoAssignEnabled   boolean  — kill switch, off by default
 *   assignmentMethod    'manual' | 'round_robin' | 'score_based'
 *   lastAssignedUserId  text     — cursor used by round-robin/tiebreak
 *
 * An "eligible agent" is a BrokerageMembership with role='realtor_member'
 * whose User.status is NOT 'offboarded' (treated as active) AND whose
 * Space row (ownerId = user.id, brokerageId = this brokerage) exists.
 *
 * This module is defensive by design:
 *   - Never throws. All failure paths return null and log.
 *   - Pre-migration safe: if the new Brokerage columns don't exist yet,
 *     the autoAssign flag is treated as false, so the caller falls back
 *     to the broker-owner space (current behaviour).
 *   - Cursor updates are fire-and-forget; a failed write never blocks
 *     the returned routing decision.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface RoutingResult {
  agentUserId: string;
  agentSpaceId: string;
  method: 'round_robin' | 'score_based';
}

type AssignmentMethod = 'manual' | 'round_robin' | 'score_based';

interface BrokerageRoutingConfig {
  autoAssignEnabled: boolean;
  assignmentMethod: AssignmentMethod;
  lastAssignedUserId: string | null;
}

interface EligibleAgent {
  userId: string;
  spaceId: string;
}

/**
 * Load the three routing-config columns off the Brokerage row. If the
 * columns are missing (migration hasn't landed yet), returns a safe
 * default that disables auto-assignment.
 */
async function loadBrokerageRoutingConfig(
  brokerageId: string,
): Promise<BrokerageRoutingConfig | null> {
  try {
    const { data, error } = await supabase
      .from('Brokerage')
      .select('autoAssignEnabled, assignmentMethod, lastAssignedUserId')
      .eq('id', brokerageId)
      .maybeSingle();

    if (error) {
      // 42703 = undefined_column → schema hasn't migrated yet. Treat as
      // auto-assign disabled. Anything else is unexpected but still safe
      // to degrade to disabled.
      const code = (error as { code?: string }).code;
      if (code === '42703') {
        logger.debug('[brokerage-routing] routing columns not present yet; treating as disabled', {
          brokerageId,
        });
        return { autoAssignEnabled: false, assignmentMethod: 'manual', lastAssignedUserId: null };
      }
      logger.warn('[brokerage-routing] failed to load brokerage routing config', { brokerageId }, error);
      return null;
    }

    if (!data) {
      logger.warn('[brokerage-routing] brokerage row not found', { brokerageId });
      return null;
    }

    const row = data as {
      autoAssignEnabled?: boolean | null;
      assignmentMethod?: string | null;
      lastAssignedUserId?: string | null;
    };

    const method: AssignmentMethod =
      row.assignmentMethod === 'round_robin' || row.assignmentMethod === 'score_based'
        ? row.assignmentMethod
        : 'manual';

    return {
      autoAssignEnabled: row.autoAssignEnabled === true,
      assignmentMethod: method,
      lastAssignedUserId: row.lastAssignedUserId ?? null,
    };
  } catch (err) {
    logger.error('[brokerage-routing] unexpected error loading routing config', { brokerageId }, err);
    return null;
  }
}

/**
 * Enumerate eligible realtor_member agents for a brokerage. An agent is
 * eligible when:
 *   - role === 'realtor_member'
 *   - User exists AND User.status !== 'offboarded' (missing status column
 *     or null status is treated as active)
 *   - A Space exists with ownerId = user.id AND brokerageId = this brokerage
 *
 * Results are sorted deterministically by userId (lex ascending) so that
 * round-robin and tie-break logic are stable across calls.
 */
async function getEligibleAgents(brokerageId: string): Promise<EligibleAgent[]> {
  try {
    const { data: memberships, error: memberError } = await supabase
      .from('BrokerageMembership')
      .select('userId, role')
      .eq('brokerageId', brokerageId)
      .eq('role', 'realtor_member');
    if (memberError) {
      logger.warn('[brokerage-routing] failed to enumerate memberships', { brokerageId }, memberError);
      return [];
    }

    const userIds = (memberships ?? [])
      .map((m: unknown) => (m as { userId: string }).userId)
      .filter(Boolean);
    if (userIds.length === 0) return [];

    // Fetch user status + brokerage-scoped spaces in parallel.
    const [usersResult, spacesResult] = await Promise.all([
      supabase.from('User').select('id, status').in('id', userIds),
      supabase
        .from('Space')
        .select('id, ownerId, brokerageId')
        .in('ownerId', userIds)
        .eq('brokerageId', brokerageId),
    ]);

    if (usersResult.error) {
      // If the status column doesn't exist yet, retry without it — we
      // simply treat everyone as active.
      const code = (usersResult.error as { code?: string }).code;
      if (code === '42703') {
        const { data: usersNoStatus, error: retryErr } = await supabase
          .from('User')
          .select('id')
          .in('id', userIds);
        if (retryErr) {
          logger.warn('[brokerage-routing] failed to fetch users (fallback)', { brokerageId }, retryErr);
          return [];
        }
        usersResult.data = (usersNoStatus ?? []).map(
          (u: unknown) => ({ ...(u as Record<string, unknown>), status: null }),
        );
      } else {
        logger.warn('[brokerage-routing] failed to fetch users', { brokerageId }, usersResult.error);
        return [];
      }
    }

    if (spacesResult.error) {
      logger.warn('[brokerage-routing] failed to fetch spaces', { brokerageId }, spacesResult.error);
      return [];
    }

    const activeUserIds = new Set<string>();
    for (const u of usersResult.data ?? []) {
      const row = u as { id: string; status?: string | null };
      if (row.status !== 'offboarded') activeUserIds.add(row.id);
    }

    const spaceByOwner = new Map<string, string>();
    for (const s of spacesResult.data ?? []) {
      const row = s as { id: string; ownerId: string };
      // If a user somehow has multiple spaces in this brokerage, the
      // first one wins — the set is keyed by ownerId.
      if (!spaceByOwner.has(row.ownerId)) spaceByOwner.set(row.ownerId, row.id);
    }

    const eligible: EligibleAgent[] = [];
    for (const userId of userIds) {
      if (!activeUserIds.has(userId)) continue;
      const spaceId = spaceByOwner.get(userId);
      if (!spaceId) continue;
      eligible.push({ userId, spaceId });
    }

    eligible.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
    return eligible;
  } catch (err) {
    logger.error('[brokerage-routing] unexpected error enumerating agents', { brokerageId }, err);
    return [];
  }
}

/**
 * Pick the agent AFTER `lastAssignedUserId` in the (already sorted)
 * candidate list. Wraps to index 0 if the cursor is null, not found,
 * or refers to the last element.
 */
function pickNextAfterCursor(
  candidates: EligibleAgent[],
  cursorUserId: string | null,
): EligibleAgent {
  if (candidates.length === 0) {
    throw new Error('pickNextAfterCursor called with empty candidates');
  }
  if (!cursorUserId) return candidates[0];
  const idx = candidates.findIndex((c) => c.userId === cursorUserId);
  if (idx === -1) return candidates[0];
  const next = candidates[(idx + 1) % candidates.length];
  return next;
}

/**
 * Fire-and-forget update of the round-robin cursor. Failures are logged
 * but never propagate — the routing decision has already been made.
 */
async function updateCursor(brokerageId: string, newCursorUserId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('Brokerage')
      .update({ lastAssignedUserId: newCursorUserId })
      .eq('id', brokerageId);
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === '42703') {
        // Column doesn't exist yet. Silent.
        return;
      }
      logger.warn('[brokerage-routing] cursor update failed', { brokerageId, newCursorUserId }, error);
    }
  } catch (err) {
    logger.warn('[brokerage-routing] cursor update threw', { brokerageId, newCursorUserId }, err);
  }
}

/**
 * Count active lead-pipeline Contacts per agent space. "Active" means:
 *   - spaceId = agent.spaceId
 *   - type IN ('QUALIFICATION','TOUR','APPLICATION')
 *   - snoozedUntil IS NULL OR snoozedUntil < now()
 *
 * Returns a map keyed by spaceId. Missing entries imply zero.
 */
async function countActiveLeadsBySpace(spaceIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (spaceIds.length === 0) return counts;

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('Contact')
      .select('spaceId, snoozedUntil')
      .in('spaceId', spaceIds)
      .in('type', ['QUALIFICATION', 'TOUR', 'APPLICATION']);

    if (error) {
      logger.warn('[brokerage-routing] contact count query failed; treating all counts as 0', {}, error);
      return counts;
    }

    for (const row of data ?? []) {
      const r = row as { spaceId: string; snoozedUntil: string | null };
      if (r.snoozedUntil && r.snoozedUntil >= nowIso) continue;
      counts.set(r.spaceId, (counts.get(r.spaceId) ?? 0) + 1);
    }
  } catch (err) {
    logger.warn('[brokerage-routing] contact count threw; treating all counts as 0', {}, err);
  }

  return counts;
}

/**
 * Pick which realtor_member should receive a new lead for this brokerage.
 * Returns null when:
 *   - autoAssignEnabled is false
 *   - assignmentMethod is 'manual'
 *   - no eligible agent (zero active realtor_members OR none has a Space
 *     inside this brokerage)
 * Callers should fall back to the broker owner's space when null.
 *
 * Pre-migration resilience: if the new columns don't exist yet, treat as
 * { autoAssignEnabled: false, assignmentMethod: 'manual' } — the null
 * return keeps every caller safe.
 */
export async function routeBrokerageLead(
  brokerageId: string,
): Promise<RoutingResult | null> {
  try {
    const config = await loadBrokerageRoutingConfig(brokerageId);
    if (!config) return null;
    if (!config.autoAssignEnabled) return null;
    if (config.assignmentMethod === 'manual') return null;

    const agents = await getEligibleAgents(brokerageId);
    if (agents.length === 0) {
      logger.info('[brokerage-routing] no eligible agents; caller falls back to owner space', {
        brokerageId,
        method: config.assignmentMethod,
      });
      return null;
    }

    if (config.assignmentMethod === 'round_robin') {
      const picked = pickNextAfterCursor(agents, config.lastAssignedUserId);
      void updateCursor(brokerageId, picked.userId);
      logger.info('[brokerage-routing] round-robin pick', {
        brokerageId,
        pickedUserId: picked.userId,
        pool: agents.length,
        cursor: config.lastAssignedUserId,
      });
      return {
        agentUserId: picked.userId,
        agentSpaceId: picked.spaceId,
        method: 'round_robin',
      };
    }

    // score_based
    const counts = await countActiveLeadsBySpace(agents.map((a) => a.spaceId));
    let minCount = Number.POSITIVE_INFINITY;
    for (const a of agents) {
      const c = counts.get(a.spaceId) ?? 0;
      if (c < minCount) minCount = c;
    }
    const tied = agents.filter((a) => (counts.get(a.spaceId) ?? 0) === minCount);
    // tied is guaranteed non-empty because agents.length > 0.
    const picked = pickNextAfterCursor(tied, config.lastAssignedUserId);
    void updateCursor(brokerageId, picked.userId);
    logger.info('[brokerage-routing] score-based pick', {
      brokerageId,
      pickedUserId: picked.userId,
      pool: agents.length,
      tiedPoolSize: tied.length,
      activeLoadOfPick: counts.get(picked.spaceId) ?? 0,
    });
    return {
      agentUserId: picked.userId,
      agentSpaceId: picked.spaceId,
      method: 'score_based',
    };
  } catch (err) {
    logger.error('[brokerage-routing] unexpected failure; returning null', { brokerageId }, err);
    return null;
  }
}

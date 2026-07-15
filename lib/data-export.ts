/**
 * Shared workspace data reader for GDPR/CCPA export.
 *
 * ONE source of truth for "what is a Space's exportable data", used by both:
 *   - the self-service export (app/api/account/export) — the owner takes a copy
 *     of their own workspace, and
 *   - the admin DSAR export (app/api/admin/users/[id]/export) — an admin
 *     fulfils a data-subject access request for a target user's workspace.
 *
 * Keeping the table list and the read loop here means the two surfaces can
 * never drift: an admin DSAR export returns exactly what the user's own export
 * returns. Keep SPACE_SCOPED_TABLES in sync with docs/DATA-DELETION.md — what we
 * export is what we delete.
 *
 * Tenant scope is the whole point: every table read is filtered on the single
 * spaceId passed in. The caller is responsible for deriving that spaceId from an
 * authenticated context (the session owner, or an admin-resolved target user) —
 * this function never reads it from a request.
 */

import { supabase } from '@/lib/supabase';

// Every Space-scoped table that holds a workspace's own data. Each is read with
// .eq('spaceId', spaceId).
export const SPACE_SCOPED_TABLES = [
  'SpaceSetting',
  'Contact',
  'ContactActivity',
  'ContactDocument',
  'DealStage',
  'Pipeline',
  'Deal',
  'DealActivity',
  'DealChecklistItem',
  'DealDocument',
  'Property',
  'PropertyPacket',
  'Conversation',
  'Message',
  'Attachment',
  'Note',
  'Tour',
  'TourFeedback',
  'TourWaitlist',
  'TourPropertyProfile',
  'TourAvailabilityOverride',
  'CalendarEvent',
  'MessageTemplate',
  'FormDraft',
  'FormAnalyticsEvent',
  'ApplicationMessage',
  'ApplicationStatusUpdate',
  'CommissionSplit',
  'AuditLog',
  'AgentSettings',
  'AgentActivityLog',
  'AgentMemory',
  'AgentGoal',
  'AgentTask',
  'McpApiKey',
  'CmaReport',
  'StudioPost',
  'File',
] as const;

/**
 * Read the full tenant-scoped footprint of one Space, keyed by table name.
 *
 * One read per table, every one scoped to `spaceId`. Sequential keeps the DB
 * pressure predictable; an export is not latency-sensitive. A missing table
 * (pre-migration) is logged and marked `{ error: 'unavailable' }` so the whole
 * export never fails on one absent relation. The DealContact junction has no
 * spaceId of its own, so it is scoped through the deal ids we just exported —
 * the same tenant boundary, reached via the deals.
 */
export async function exportSpaceData(spaceId: string): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  for (const table of SPACE_SCOPED_TABLES) {
    const { data: rows, error } = await supabase
      .from(table)
      .select('*')
      .eq('spaceId', spaceId);
    if (error) {
      console.error(`[data-export] ${table} read failed`, error.message);
      data[table] = { error: 'unavailable' };
      continue;
    }
    data[table] = rows ?? [];
  }

  // DealContact is a junction with no spaceId — scope it through the deals we
  // just exported. Same tenant boundary, reached via the deal ids.
  const dealRows = Array.isArray(data['Deal']) ? (data['Deal'] as Array<{ id: string }>) : [];
  const dealIds = dealRows.map((d) => d.id);
  if (dealIds.length > 0) {
    const { data: dealContacts, error } = await supabase
      .from('DealContact')
      .select('*')
      .in('dealId', dealIds);
    data['DealContact'] = error ? { error: 'unavailable' } : (dealContacts ?? []);
  } else {
    data['DealContact'] = [];
  }

  return data;
}

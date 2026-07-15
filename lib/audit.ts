/**
 * Persistent audit logging for SOC 2 compliance (TSC CC7.3, CC9.2, A1.2).
 *
 * All writes go to the AuditLog table via the service-role client.
 * Errors are logged to console but never throw — audit failure must
 * not block the user-facing operation.
 *
 * Usage:
 *   await audit({
 *     actorClerkId: userId,
 *     action: 'DELETE',
 *     resource: 'Contact',
 *     resourceId: contactId,
 *     spaceId: space.id,
 *     req,                   // optional — extracts IP automatically
 *     metadata: { name },    // optional before/after snapshots
 *   });
 */

import { supabase } from '@/lib/supabase';
import { getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { after, type NextRequest } from 'next/server';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACCESS'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ADMIN_ACTION'
  // Brokerage-specific lifecycle actions — kept in the union so callers
  // don't have to cast. OFFBOARD covers the agent-offboarding transfer
  // (Phase BP1); future brokerage phases can add more verbs here.
  | 'OFFBOARD';

export interface AuditParams {
  /** Clerk userId of the person performing the action */
  actorClerkId: string | null;
  action: AuditAction;
  /** Table/entity name, e.g. 'Contact', 'Deal', 'Space' */
  resource: string;
  /** Primary key of the affected row */
  resourceId?: string;
  /** Workspace context — required for tenant-scoped resources */
  spaceId?: string;
  /** NextRequest, used to extract IP address */
  req?: NextRequest;
  /** Free-form JSON — before/after snapshots, tags, etc. */
  metadata?: Record<string, unknown>;
}

async function persistAudit(params: AuditParams): Promise<void> {
  const {
    actorClerkId,
    action,
    resource,
    resourceId,
    spaceId,
    req,
    metadata,
  } = params;

  const ipAddress = req ? getClientIp(req) : null;

  // Resolve the internal User.id so the actorId column stops being dead —
  // SOC2 access investigations join audit rows to the internal user, not
  // just the Clerk id. Best-effort: a lookup miss leaves actorId null.
  let actorId: string | null = null;
  if (actorClerkId) {
    try {
      const { data } = await supabase
        .from('User')
        .select('id')
        .eq('clerkId', actorClerkId)
        .maybeSingle();
      actorId = (data as { id?: string } | null)?.id ?? null;
    } catch {
      /* leave null — never block the audit write on the lookup */
    }
  }

  try {
    const { error } = await supabase.from('AuditLog').insert({
      id: crypto.randomUUID(),
      actorId,
      clerkId: actorClerkId,
      ipAddress,
      action,
      resource,
      resourceId: resourceId ?? null,
      spaceId: spaceId ?? null,
      metadata: metadata ?? null,
    });
    if (error) {
      logger.error('[audit] failed to persist audit event', { action, resource, resourceId }, error);
    }
  } catch (err) {
    logger.error('[audit] unexpected error', { action, resource, resourceId }, err);
  }
}

/**
 * Persist the event immediately for callers that await it, while also
 * registering the same in-flight promise with after(). Callers that deliberately
 * use `void audit(...)` stay non-blocking without risking termination when the
 * route returns. Outside a Next.js request scope, after() throws and the normal
 * awaited/best-effort behavior remains unchanged.
 */
export async function audit(params: AuditParams): Promise<void> {
  const task = persistAudit(params);
  try {
    after(() => task);
  } catch {
    // Workers and unit tests may not have a Next.js request context.
  }
  await task;
}

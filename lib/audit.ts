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
import type { NextRequest } from 'next/server';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACCESS'
  | 'LOGIN'
  | 'ADMIN_ACTION';

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

export async function audit(params: AuditParams): Promise<void> {
  const {
    actorClerkId,
    action,
    resource,
    resourceId,
    spaceId,
    req,
    metadata,
  } = params;

  const ipAddress =
    req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req?.headers.get('x-real-ip') ??
    null;

  try {
    const { error } = await supabase.from('AuditLog').insert({
      id: crypto.randomUUID(),
      clerkId: actorClerkId,
      ipAddress,
      action,
      resource,
      resourceId: resourceId ?? null,
      spaceId: spaceId ?? null,
      metadata: metadata ?? null,
    });
    if (error) {
      console.error('[audit] failed to persist audit event', { error, action, resource, resourceId });
    }
  } catch (err) {
    console.error('[audit] unexpected error', { err, action, resource, resourceId });
  }
}

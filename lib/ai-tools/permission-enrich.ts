/**
 * Resolve CRM ids on an approval prompt so the realtor sees "Move Oak
 * Street to Under contract" instead of truncated UUIDs. Lookups are
 * tenant-scoped and never fail the pause — a miss leaves the generic title.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';

export interface ApprovalLookup {
  dealTitle?(id: string): Promise<string | null>;
  stageName?(id: string): Promise<string | null>;
  personName?(id: string): Promise<string | null>;
  propertyAddress?(id: string): Promise<string | null>;
}

function idOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function pick(
  lookup: ((id: string) => Promise<string | null>) | undefined,
  id: string | null,
): Promise<string | null> {
  if (!lookup || !id) return null;
  try {
    const value = await lookup(id);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function resolveApprovalDisplayArgs(
  name: string,
  args: Record<string, unknown>,
  lookup: ApprovalLookup,
): Promise<Record<string, unknown>> {
  const dealId = /deal|won|lost|stage/i.test(name) ? idOf(args.dealId) : null;
  const stageId = /stage|deal/i.test(name) ? idOf(args.stageId) : null;
  const personId = /person|contact|followup|tour|email|sms/i.test(name)
    ? idOf(args.personId) ?? idOf(args.contactId)
    : null;
  const propertyId = /property|tour/i.test(name) ? idOf(args.propertyId) : null;

  const [dealTitle, stageName, personName, propertyAddress] = await Promise.all([
    pick(lookup.dealTitle, dealId),
    pick(lookup.stageName, stageId),
    pick(lookup.personName, personId),
    pick(lookup.propertyAddress, propertyId),
  ]);

  const next = { ...args };
  if (dealTitle && typeof args.dealTitle !== 'string') next.dealTitle = dealTitle;
  if (stageName && typeof args.stageName !== 'string') next.stageName = stageName;
  if (personName && typeof args.personName !== 'string' && typeof args.name !== 'string') {
    next.personName = personName;
  }
  if (propertyAddress && typeof args.propertyAddress !== 'string' && typeof args.address !== 'string') {
    next.propertyAddress = propertyAddress;
  }

  return next;
}

async function scopedName(
  table: 'Deal' | 'DealStage' | 'Contact' | 'Property',
  spaceId: string,
  id: string,
  column: 'title' | 'name' | 'address',
): Promise<string | null> {
  // tenantTable pre-applies spaceId; its public type stops at the first
  // `.eq`, so the id filter + maybeSingle are asserted here.
  const scoped = tenantTable(supabase, table, { spaceId }).select(column) as {
    eq: (col: string, val: string) => {
      maybeSingle: () => Promise<{ data?: Record<string, unknown> | null; error?: unknown }>;
    };
  };
  const result = await scoped.eq('id', id).maybeSingle();
  if (result.error || !result.data || typeof result.data !== 'object') return null;
  const value = result.data[column];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function createTenantApprovalLookup(spaceId: string): ApprovalLookup {
  return {
    dealTitle: (id) => scopedName('Deal', spaceId, id, 'title'),
    stageName: (id) => scopedName('DealStage', spaceId, id, 'name'),
    personName: (id) => scopedName('Contact', spaceId, id, 'name'),
    propertyAddress: (id) => scopedName('Property', spaceId, id, 'address'),
  };
}

export async function withApprovalDisplayArgs(
  spaceId: string | null | undefined,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!spaceId) return args;
  try {
    return await resolveApprovalDisplayArgs(name, args, createTenantApprovalLookup(spaceId));
  } catch {
    return args;
  }
}

import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { BrokerLeadsClient, type LeadRow, type RealtorOption } from './broker-leads-client';

export const metadata: Metadata = { title: 'Leads — Broker Dashboard' };

export default async function BrokerLeadsPage() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    redirect('/');
  }

  const { brokerage, dbUserId } = ctx;

  // Find the broker owner's space
  const { data: ownerSpace } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', dbUserId)
    .maybeSingle();

  const brokerSpaceId = ownerSpace?.id ?? null;

  // Query unassigned leads: contacts in broker's space with tag 'brokerage-lead' but NOT 'assigned'
  const { data: unassignedRaw } = brokerSpaceId
    ? await supabase
        .from('Contact')
        .select('id, name, email, phone, budget, scoreLabel, leadScore, tags, createdAt, applicationData')
        .eq('spaceId', brokerSpaceId)
        .contains('tags', ['brokerage-lead'])
        .not('tags', 'cs', '["assigned"]')
        .order('createdAt', { ascending: false })
        .limit(500)
    : { data: [] };

  // Query assigned leads: contacts with tag 'assigned'
  const { data: assignedRaw } = brokerSpaceId
    ? await supabase
        .from('Contact')
        .select('id, name, email, phone, budget, scoreLabel, leadScore, tags, createdAt, notes, applicationData')
        .eq('spaceId', brokerSpaceId)
        .contains('tags', ['assigned'])
        .order('createdAt', { ascending: false })
        .limit(500)
    : { data: [] };

  // Query brokerage members (realtors)
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select(
      'id, role, userId, User(id, name, email), Space!Space_ownerId_fkey(id, slug, name)'
    )
    .eq('brokerageId', brokerage.id)
    .eq('role', 'realtor_member')
    .order('createdAt', { ascending: true });

  const members = (memberships ?? []) as Array<{
    id: string;
    role: string;
    userId: string;
    User: { id: string; name: string | null; email: string } | null;
    Space: { id: string; slug: string; name: string } | null;
  }>;

  // Get lead counts per realtor space
  const realtorSpaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];
  const { data: leadCounts } = realtorSpaceIds.length > 0
    ? await supabase
        .from('Contact')
        .select('spaceId')
        .in('spaceId', realtorSpaceIds)
        .limit(10000)
    : { data: [] };

  const countBySpace = (leadCounts ?? []).reduce<Record<string, number>>(
    (acc, r: { spaceId: string }) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const realtors: RealtorOption[] = members.map((m) => ({
    userId: m.userId,
    name: m.User?.name ?? null,
    email: m.User?.email ?? '',
    spaceId: m.Space?.id ?? null,
    leadCount: m.Space?.id ? (countBySpace[m.Space.id] ?? 0) : 0,
  }));

  type RawContact = {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    budget: number | null;
    scoreLabel: string | null;
    leadScore: number | null;
    tags: string[];
    createdAt: string;
    notes: string | null;
    applicationData: Record<string, unknown> | null;
  };

  function toLeadRow(c: RawContact): LeadRow {
    const moveTiming = c.applicationData?.targetMoveInDate as string | undefined;
    // Try to extract assigned realtor name from notes (format: "Assigned to: Name")
    const assignedMatch = c.notes?.match(/Assigned to: (.+?)(?:\n|$)/);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      budget: c.budget,
      scoreLabel: c.scoreLabel,
      leadScore: c.leadScore,
      moveTiming: moveTiming ?? null,
      createdAt: c.createdAt,
      assignedTo: assignedMatch?.[1] ?? null,
      assignedAt: c.tags.includes('assigned') ? c.createdAt : null,
    };
  }

  const unassignedLeads: LeadRow[] = (unassignedRaw ?? []).map((c: unknown) => toLeadRow(c as RawContact));
  const assignedLeads: LeadRow[] = (assignedRaw ?? []).map((c: unknown) => toLeadRow(c as RawContact));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {unassignedLeads.length} unassigned &middot; {assignedLeads.length} assigned &middot; {brokerage.name}
        </p>
      </div>

      <BrokerLeadsClient
        unassignedLeads={unassignedLeads}
        assignedLeads={assignedLeads}
        realtors={realtors}
      />
    </div>
  );
}

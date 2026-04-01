import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { BrokerLeadsClient, type LeadRow, type RealtorOption, type AssignedLeadProgress } from './broker-leads-client';

export const metadata: Metadata = { title: 'Leads — Broker Dashboard' };

export default async function BrokerLeadsPage() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    redirect('/');
  }

  const { brokerage } = ctx;

  // Find the broker owner's space (using brokerage.ownerId to match the assign-lead API)
  const { data: ownerSpace } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerage.ownerId)
    .maybeSingle();

  const brokerSpaceId = ownerSpace?.id ?? null;

  // Query unassigned leads: contacts in broker's space with tag 'brokerage-lead' but NOT 'assigned'
  const { data: unassignedRaw } = brokerSpaceId
    ? await supabase
        .from('Contact')
        .select('id, name, email, phone, budget, scoreLabel, leadScore, leadType, tags, createdAt, notes, applicationData')
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
        .select('id, name, email, phone, budget, scoreLabel, leadScore, leadType, tags, createdAt, notes, applicationData, applicationStatusNote')
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

  const members = (memberships ?? []) as unknown as Array<{
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
    applicationStatusNote?: string | null;
  };

  // Build a map of userId -> realtor name for resolving assignments
  const realtorNameMap = new Map<string, string>();
  for (const m of members) {
    realtorNameMap.set(m.userId, m.User?.name ?? m.User?.email ?? 'Unknown');
  }

  // ── Parse assignment metadata from assigned contacts ──────────────────
  type AssignmentMeta = {
    assignedTo: string;
    assignedToName: string;
    assignedContactId: string;
    assignedSpaceId: string;
    assignedAt: string;
  };

  const assignmentMap = new Map<string, AssignmentMeta>();
  const realtorContactIds: string[] = [];

  for (const c of (assignedRaw ?? []) as RawContact[]) {
    if (c.applicationStatusNote) {
      try {
        const meta = JSON.parse(c.applicationStatusNote) as AssignmentMeta;
        assignmentMap.set(c.id, meta);
        if (meta.assignedContactId) {
          realtorContactIds.push(meta.assignedContactId);
        }
      } catch {
        // Legacy format or invalid JSON — fall back to notes parsing
      }
    }
  }

  // ── Fetch realtor-side contact progress for assigned leads ────────────
  type RealtorContact = {
    id: string;
    type: string;
    leadScore: number | null;
    scoreLabel: string | null;
    followUpAt: string | null;
    lastContactedAt: string | null;
    updatedAt: string;
  };

  const { data: realtorContacts } = realtorContactIds.length > 0
    ? await supabase
        .from('Contact')
        .select('id, type, leadScore, scoreLabel, followUpAt, lastContactedAt, updatedAt')
        .in('id', realtorContactIds)
        .limit(500)
    : { data: [] };

  const realtorContactMap = new Map<string, RealtorContact>();
  for (const rc of (realtorContacts ?? []) as RealtorContact[]) {
    realtorContactMap.set(rc.id, rc);
  }

  // ── Fetch deals linked to realtor-side contacts ───────────────────────
  const { data: dealContactLinks } = realtorContactIds.length > 0
    ? await supabase
        .from('DealContact')
        .select('dealId, contactId')
        .in('contactId', realtorContactIds)
        .limit(500)
    : { data: [] };

  const contactHasDeal = new Set<string>();
  for (const dc of (dealContactLinks ?? []) as { dealId: string; contactId: string }[]) {
    contactHasDeal.add(dc.contactId);
  }

  // ── Build progress map keyed by broker contact ID ─────────────────────
  const progressMap = new Map<string, AssignedLeadProgress>();

  for (const [brokerContactId, meta] of assignmentMap) {
    const rc = realtorContactMap.get(meta.assignedContactId);
    progressMap.set(brokerContactId, {
      realtorName: meta.assignedToName,
      assignedAt: meta.assignedAt,
      assignedContactId: meta.assignedContactId,
      assignedSpaceId: meta.assignedSpaceId,
      currentStage: (rc?.type as AssignedLeadProgress['currentStage']) ?? 'QUALIFICATION',
      currentScore: rc?.leadScore ?? null,
      currentScoreLabel: rc?.scoreLabel ?? null,
      lastActivityAt: rc?.lastContactedAt ?? rc?.updatedAt ?? null,
      hasFollowUp: rc?.followUpAt != null,
      followUpAt: rc?.followUpAt ?? null,
      hasDeal: contactHasDeal.has(meta.assignedContactId),
    });
  }

  function toLeadRow(c: RawContact): LeadRow {
    const moveTiming = c.applicationData?.targetMoveInDate as string | undefined;

    // Try structured metadata first, fall back to notes parsing
    const meta = assignmentMap.get(c.id);
    let assignedName: string | null = null;
    let assignedAt: string | null = null;

    if (meta) {
      assignedName = meta.assignedToName;
      assignedAt = meta.assignedAt;
    } else {
      // Legacy: parse from notes
      const realtorIdMatch = c.notes?.match(/Assigned to realtor \(([^)]+)\)/);
      assignedName = realtorIdMatch?.[1]
        ? realtorNameMap.get(realtorIdMatch[1]) ?? 'Realtor'
        : null;
      const dateMatch = c.notes?.match(/Assigned to realtor .+ on (\S+)/);
      assignedAt = dateMatch?.[1] ?? (c.tags.includes('assigned') ? c.createdAt : null);
    }

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      budget: c.budget,
      scoreLabel: c.scoreLabel,
      leadScore: c.leadScore,
      leadType: (c as any).leadType ?? 'rental',
      moveTiming: moveTiming ?? null,
      createdAt: c.createdAt,
      assignedTo: assignedName,
      assignedAt,
    };
  }

  const unassignedLeads: LeadRow[] = (unassignedRaw ?? []).map((c: unknown) => toLeadRow(c as RawContact));
  const assignedLeads: LeadRow[] = (assignedRaw ?? []).map((c: unknown) => toLeadRow(c as RawContact));

  // Serialize progress map for client
  const assignedLeadProgress: Record<string, AssignedLeadProgress> = {};
  for (const [id, progress] of progressMap) {
    assignedLeadProgress[id] = progress;
  }

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
        assignedLeadProgress={assignedLeadProgress}
      />
    </div>
  );
}
